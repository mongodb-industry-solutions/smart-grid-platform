const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";
const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";
const TARIFFS_COLLECTION_NAME =
  process.env.TARIFFS_COLLECTION_NAME || "tariff_catalog";

// customer_db stores full state names ("Texas") while tariff_catalog uses
// abbreviations / "City, ST" labels — map them so the two can be joined.
const STATE_ABBREVIATIONS = {
  Texas: "TX",
  Colorado: "CO",
  Kansas: "KS",
  Missouri: "MO",
  "New Mexico": "NM",
  California: "CA",
  Tennessee: "TN",
  Arizona: "AZ",
};

// Builds the "City, ST" label used as tariff_catalog.location_label.
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

  // Tier bands only apply to tiered tariffs; TOU tariffs store period rates in
  // energyRateStrux that aren't usage tiers, so don't surface them as tiers.
  const tiers =
    tariff?.rate_type === "tiered"
      ? tariff.energyRateStrux?.[0]?.energyRateTiers ?? []
      : [];

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

// 15-minute readings → number of intervals in a ~30-day month.
const INTERVALS_PER_MONTH = 4 * 24 * 30;

// Friendly headline for a rate type (neutral label for unknown types).
function planTypeLabel(rateType) {
  if (rateType === "tou") return "Time-of-Use Plan";
  if (rateType === "tiered") return "Tiered Plan";
  return "Tariff Plan";
}

// Safe $/kWh for a TOU period (first tier rate + adj), or null if the period
// is missing its rate data.
function periodRate(period) {
  const tier = period?.energyRateTiers?.[0];
  if (!tier || tier.rate == null) return null;
  return tier.rate + (tier.adj ?? 0);
}

// Estimates monthly kWh from a meter's cumulative `energy` readings: average
// per-interval consumption extrapolated to a month.
function estimateMonthlyKwh(rows) {
  if (rows.length < 2) return null;
  let total = 0;
  let count = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const delta = rows[i].energy - rows[i - 1].energy;
    if (delta > 0) {
      total += delta;
      count += 1;
    }
  }
  if (!count) return 0;
  return (total / count) * INTERVALS_PER_MONTH;
}

// Cost of `kwh` under a set of tiered bands ({ max, rate, adj }).
function tieredEnergyCost(kwh, tiers) {
  let cost = 0;
  let prevMax = 0;
  for (const tier of tiers) {
    const cap = tier.max ?? Infinity;
    const band = Math.max(0, Math.min(kwh, cap) - prevMax);
    cost += band * (tier.rate + (tier.adj ?? 0));
    prevMax = cap;
    if (kwh <= cap) break;
  }
  return cost;
}

// Blended $/kWh for a TOU tariff: each strux is a rate period; weight its rate
// by how much of the schedule (month × hour) falls in that period.
function touBlendedRate(strux, schedule) {
  const counts = {};
  let total = 0;
  for (const row of schedule || []) {
    for (const idx of row) {
      counts[idx] = (counts[idx] ?? 0) + 1;
      total += 1;
    }
  }
  if (!total) {
    // No schedule — fall back to the average of the (valid) period rates.
    const rates = (strux || []).map(periodRate).filter((r) => r != null);
    return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
  }
  let rate = 0;
  for (const [idx, c] of Object.entries(counts)) {
    const r = periodRate(strux[Number(idx)]);
    if (r == null) continue;
    rate += (c / total) * r;
  }
  return rate;
}

// ── DEMO assumptions (not in the data) — tweak freely ──
// Demand charge $/kW: tariff_catalog has no demand rate, so this is a placeholder.
const DEMO_DEMAND_RATE = 8;
// Pattern adjustment heuristics (applied as % of the fixed+energy+demand subtotal).
const DEMO_PATTERN = {
  goodPowerFactor: 0.95, // PF at/above this → discount
  poorPowerFactor: 0.9, //  PF below this → surcharge
  powerFactorAdj: 0.03, //  ±3%
  steadyLoadFactor: 0.5, // load factor at/above this → discount
  spikyLoadFactor: 0.3, //  load factor below this → surcharge
  loadFactorAdj: 0.02, //   ±2%
};

// Pattern adjustment as a signed fraction (negative = discount).
function patternAdjustmentPct(avgPowerFactor, loadFactor) {
  let pct = 0;
  if (avgPowerFactor != null) {
    if (avgPowerFactor >= DEMO_PATTERN.goodPowerFactor)
      pct -= DEMO_PATTERN.powerFactorAdj;
    else if (avgPowerFactor < DEMO_PATTERN.poorPowerFactor)
      pct += DEMO_PATTERN.powerFactorAdj;
  }
  if (loadFactor != null) {
    if (loadFactor >= DEMO_PATTERN.steadyLoadFactor)
      pct -= DEMO_PATTERN.loadFactorAdj;
    else if (loadFactor < DEMO_PATTERN.spikyLoadFactor)
      pct += DEMO_PATTERN.loadFactorAdj;
  }
  return pct;
}

// Monthly energy charge that reflects WHEN the customer uses energy: splits the
// customer's own consumption across TOU periods (via energyWeekdaySched) for
// TOU tariffs, or applies tier bands for tiered tariffs.
function personalizedEnergyCharge(tariff, intervals, monthlyKwh) {
  if (tariff.rate_type === "tiered") {
    const tiers = tariff.energyRateStrux?.[0]?.energyRateTiers ?? [];
    return tieredEnergyCost(monthlyKwh, tiers);
  }

  const strux = tariff.energyRateStrux ?? [];
  const sched = tariff.energyWeekdaySched;
  const byPeriod = {};
  let total = 0;
  for (const iv of intervals) {
    const period = sched?.[iv.month]?.[iv.hour] ?? 0;
    byPeriod[period] = (byPeriod[period] ?? 0) + iv.consumption;
    total += iv.consumption;
  }
  if (!total) return monthlyKwh * touBlendedRate(strux, sched);

  let effectiveRate = 0;
  for (const [idx, consumption] of Object.entries(byPeriod)) {
    const r = periodRate(strux[Number(idx)]);
    if (r == null) continue;
    effectiveRate += (consumption / total) * r;
  }
  return monthlyKwh * effectiveRate;
}

/**
 * Estimates a customer's personalized monthly tariff and its breakdown, from
 * their meter readings and (clearly marked) demo assumptions/heuristics:
 *
 *   total = fixed charge
 *         + energy charge   (tier bands, or TOU split by the customer's own hours)
 *         + demand charge   (peak kW × DEMO_DEMAND_RATE — not in the catalog)
 *         + pattern adj.    (± % from power-factor & load-factor heuristics)
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {number} dataid the meter/customer id
 * @returns {Promise<object|null>} the estimate + breakdown, or null
 */
export async function getTariffRecommendation(db, dataid) {
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);
  const readings = db.collection(READINGS_COLLECTION_NAME);
  const tariffs = db.collection(TARIFFS_COLLECTION_NAME);

  const customer = await customers.findOne(
    { dataid },
    { projection: { _id: 0, city: 1, state: 1 } }
  );
  if (!customer) return null;
  const locationLabel = toLocationLabel(customer.city, customer.state);

  const rows = await readings
    .find(
      { dataid },
      {
        projection: {
          _id: 0,
          timestamp: 1,
          energy: 1,
          power: 1,
          power_factor: 1,
        },
      }
    )
    .sort({ timestamp: 1 })
    .toArray();

  const monthlyKwh = estimateMonthlyKwh(rows);
  if (monthlyKwh == null) return null;

  const tariff = await tariffs.findOne({ location_label: locationLabel });
  if (!tariff) return null;

  // Per-interval consumption tagged with hour/month, for the TOU split.
  const intervals = [];
  for (let i = 1; i < rows.length; i += 1) {
    const consumption = rows[i].energy - rows[i - 1].energy;
    if (consumption <= 0) continue;
    const ts = new Date(rows[i].timestamp);
    intervals.push({
      month: ts.getUTCMonth(),
      hour: ts.getUTCHours(),
      consumption,
    });
  }

  // Usage characteristics from the power readings. reduce() (not Math.max(...))
  // so a customer with many readings can't overflow the call stack.
  const powers = rows.map((r) => r.power).filter((p) => p != null);
  const peakKw = powers.reduce((max, p) => (p > max ? p : max), 0) / 1000;
  const avgKw = powers.length
    ? powers.reduce((a, b) => a + b, 0) / powers.length / 1000
    : 0;
  const loadFactor = peakKw > 0 ? avgKw / peakKw : null;
  const pfs = rows.map((r) => r.power_factor).filter((p) => p != null);
  const avgPowerFactor = pfs.length
    ? pfs.reduce((a, b) => a + b, 0) / pfs.length
    : null;

  // Breakdown: fixed + energy + demand + pattern adjustment.
  const fixed = tariff.fixedChargeFirstMeter ?? 0;
  const energy = personalizedEnergyCharge(tariff, intervals, monthlyKwh);
  const demand = peakKw * DEMO_DEMAND_RATE;
  const subtotal = fixed + energy + demand;
  const patternPct = patternAdjustmentPct(avgPowerFactor, loadFactor);
  const pattern = subtotal * patternPct;
  const total = subtotal + pattern;

  return {
    monthlyKwh: Math.round(monthlyKwh),
    peakKw: Math.round(peakKw * 100) / 100,
    loadFactor: loadFactor != null ? Math.round(loadFactor * 100) / 100 : null,
    powerFactor:
      avgPowerFactor != null ? Math.round(avgPowerFactor * 1000) / 1000 : null,
    plan: {
      name: planTypeLabel(tariff.rate_type),
      rateName: tariff.rateName,
      utilityName: tariff.utilityName,
      rateType: tariff.rate_type,
    },
    components: { fixed, energy, demand, pattern },
    total,
    assumptions: { demandRate: DEMO_DEMAND_RATE },
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
