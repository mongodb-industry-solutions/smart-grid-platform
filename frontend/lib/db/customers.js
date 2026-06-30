const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";
const TARIFFS_COLLECTION_NAME =
  process.env.TARIFFS_COLLECTION_NAME || "tarrif_catalog";

// customer_db stores full state names ("Texas") while tarrif_catalog uses
// abbreviations / "City, ST" labels — map them so the two can be joined.
const STATE_ABBREVIATIONS = {
  Texas: "TX",
  Colorado: "CO",
  Kansas: "KS",
  Missouri: "MO",
  "New Mexico": "NM",
  California: "CA",
};

// Builds the "City, ST" label used as tarrif_catalog.location_label.
function toLocationLabel(city, state) {
  const abbreviation = STATE_ABBREVIATIONS[state] || state;
  return `${city}, ${abbreviation}`;
}

// Latest reading per meter (dataid), keyed by dataid.
async function getLatestReadingsByMeter(readings) {
  const rows = await readings
    .aggregate([
      { $sort: { dataid: 1, timestamp: -1 } },
      {
        $group: {
          _id: "$dataid",
          timestamp: { $first: "$timestamp" },
          energy: { $first: "$energy" },
          power: { $first: "$power" },
          voltage: { $first: "$voltage" },
          current: { $first: "$current" },
          power_factor: { $first: "$power_factor" },
        },
      },
    ])
    .toArray();

  return new Map(rows.map((r) => [r._id, r]));
}

/**
 * Lists customers with the basic info shown in the customers list: location,
 * their matched tariff plan, and their latest energy reading.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @returns {Promise<Array<{
 *   dataid: number, city: string, state: string, locationLabel: string,
 *   utilityName: string|null, rateName: string|null, rateType: string|null,
 *   energy: number|null, lastReadingAt: Date|null
 * }>>}
 */
export async function getCustomers(db) {
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);
  const tariffs = db.collection(TARIFFS_COLLECTION_NAME);
  const readings = db.collection(READINGS_COLLECTION_NAME);

  const [customerDocs, tariffDocs, readingsByMeter] = await Promise.all([
    customers
      .find({}, { projection: { _id: 0, dataid: 1, city: 1, state: 1 } })
      .sort({ dataid: 1 })
      .toArray(),
    tariffs
      .find(
        {},
        {
          projection: {
            _id: 0,
            location_label: 1,
            utilityName: 1,
            rateName: 1,
            rate_type: 1,
          },
        }
      )
      .toArray(),
    getLatestReadingsByMeter(readings),
  ]);

  const tariffByLocation = new Map(
    tariffDocs.map((t) => [t.location_label, t])
  );

  return customerDocs.map((customer) => {
    const locationLabel = toLocationLabel(customer.city, customer.state);
    const tariff = tariffByLocation.get(locationLabel) ?? null;
    const reading = readingsByMeter.get(customer.dataid) ?? null;

    return {
      dataid: customer.dataid,
      city: customer.city,
      state: customer.state,
      locationLabel,
      utilityName: tariff?.utilityName ?? null,
      rateName: tariff?.rateName ?? null,
      rateType: tariff?.rate_type ?? null,
      energy: reading?.energy ?? null,
      lastReadingAt: reading?.timestamp ?? null,
    };
  });
}

/**
 * Full detail for one customer: location, matched tariff (with the tiered rate
 * table), and the latest meter reading metrics.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {number} dataid the meter/customer id
 * @returns {Promise<object|null>} the customer detail, or null if not found
 */
export async function getCustomerDetail(db, dataid) {
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);
  const tariffs = db.collection(TARIFFS_COLLECTION_NAME);
  const readings = db.collection(READINGS_COLLECTION_NAME);

  const customer = await customers.findOne(
    { dataid },
    { projection: { _id: 0, dataid: 1, city: 1, state: 1 } }
  );
  if (!customer) return null;

  const locationLabel = toLocationLabel(customer.city, customer.state);

  const [tariff, latest] = await Promise.all([
    tariffs.findOne({ location_label: locationLabel }, { projection: { _id: 0 } }),
    readings.findOne(
      { dataid },
      {
        sort: { timestamp: -1 },
        projection: {
          _id: 0,
          timestamp: 1,
          energy: 1,
          power: 1,
          voltage: 1,
          current: 1,
          power_factor: 1,
        },
      }
    ),
  ]);

  const tiers = tariff?.energyRateStrux?.[0]?.energyRateTiers ?? [];

  return {
    dataid: customer.dataid,
    city: customer.city,
    state: customer.state,
    locationLabel,
    tariff: tariff
      ? {
          utilityName: tariff.utilityName,
          rateName: tariff.rateName,
          rateType: tariff.rate_type,
          fixedCharge: tariff.fixedChargeFirstMeter,
          fixedChargeUnits: tariff.fixedChargeUnits,
          effectiveDate: tariff.effectiveDate,
          sourceReference: tariff.sourceReference ?? null,
          tiers: tiers.map((tier) => ({
            max: tier.max ?? null,
            unit: tier.unit,
            rate: tier.rate,
            adj: tier.adj ?? null,
          })),
        }
      : null,
    latestReading: latest
      ? {
          timestamp: latest.timestamp,
          energy: latest.energy,
          power: latest.power,
          voltage: latest.voltage,
          current: latest.current,
          powerFactor: latest.power_factor,
        }
      : null,
  };
}

// Rounds a kWh value to 4 decimals (per-interval consumption is small).
function roundKwh(value) {
  return Math.round(value * 10000) / 10000;
}

/**
 * Per-interval consumption trend for one customer vs the average of a region.
 *
 * `energy` is a cumulative meter reading, so consumption for an interval is the
 * difference from the previous reading. Returns one point per timestamp with
 * the selected customer's consumption (`actual`) and the region average
 * (`segment`), both in kWh.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {number} dataid the selected customer/meter id
 * @param {string|null} [regionFilter] "City, ST" label to compare against;
 *   defaults to the selected customer's own region
 * @returns {Promise<{
 *   dataid: number, regionLabel: string|null, availableRegions: string[],
 *   points: Array<{ time: string, actual: number|null, segment: number|null }>
 * }>}
 */
export async function getConsumptionTrend(db, dataid, regionFilter = null) {
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);
  const readings = db.collection(READINGS_COLLECTION_NAME);

  const customerDocs = await customers
    .find({}, { projection: { _id: 0, dataid: 1, city: 1, state: 1 } })
    .toArray();

  const labelOf = (c) => toLocationLabel(c.city, c.state);
  const availableRegions = [...new Set(customerDocs.map(labelOf))].sort();

  const selected = customerDocs.find((c) => c.dataid === dataid);
  const regionLabel =
    regionFilter || (selected ? labelOf(selected) : availableRegions[0]) || null;

  const regionDataids = customerDocs
    .filter((c) => labelOf(c) === regionLabel)
    .map((c) => c.dataid);
  const ids = [...new Set([dataid, ...regionDataids].filter((v) => v != null))];

  const rows = await readings
    .find(
      { dataid: { $in: ids } },
      { projection: { _id: 0, dataid: 1, timestamp: 1, energy: 1 } }
    )
    .sort({ dataid: 1, timestamp: 1 })
    .toArray();

  // Group readings by meter so we can diff consecutive cumulative readings.
  const byMeter = new Map();
  for (const row of rows) {
    if (!byMeter.has(row.dataid)) byMeter.set(row.dataid, []);
    byMeter.get(row.dataid).push(row);
  }

  // Per meter: map of timestamp -> consumption for that interval.
  const consumptionByMeter = new Map();
  const allTimestamps = new Set();
  for (const [id, list] of byMeter) {
    const map = new Map();
    for (let i = 1; i < list.length; i += 1) {
      const ts = new Date(list[i].timestamp).toISOString();
      const consumption = list[i].energy - list[i - 1].energy;
      map.set(ts, consumption > 0 ? consumption : 0);
      allTimestamps.add(ts);
    }
    consumptionByMeter.set(id, map);
  }

  const customerMap = consumptionByMeter.get(dataid) ?? new Map();

  const points = [...allTimestamps]
    .sort()
    .map((ts) => {
      let sum = 0;
      let count = 0;
      for (const id of regionDataids) {
        const map = consumptionByMeter.get(id);
        if (map?.has(ts)) {
          sum += map.get(ts);
          count += 1;
        }
      }
      return {
        time: ts,
        actual: customerMap.has(ts) ? roundKwh(customerMap.get(ts)) : null,
        segment: count ? roundKwh(sum / count) : null,
      };
    });

  return { dataid, regionLabel, availableRegions, points };
}
