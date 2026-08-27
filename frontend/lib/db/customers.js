import { readRollupAll } from "./rollups.js";

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
export function toLocationLabel(city, state) {
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

  // Try pre-computed latest readings first.
  const rollup = await readRollupAll(db, "rollup_latest_readings");
  const readingsPromise = rollup && !rollup.isStale
    ? Promise.resolve(new Map(rollup.data.map((r) => [r._id, r])))
    : getLatestReadingsByMeter(readings);

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
    readingsPromise,
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

// Hours in a ~30-day month, used to extrapolate an observed energy rate.
const HOURS_PER_MONTH = 24 * 30;

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

// Estimates monthly kWh from a meter's precomputed per-interval consumption
// (`interval_kwh`). Uses the observed energy-per-hour rate (total consumed /
// elapsed hours) extrapolated to a month, so it's correct at ANY cadence — 15-min
// history and 1-second live readings alike.
function estimateMonthlyKwh(rows) {
  if (rows.length < 2) return null;
  // Sum the intervals strictly inside [first, last] — skip rows[0], whose
  // interval_kwh belongs to the interval before the window start, so the
  // numerator lines up with the elapsed-hours denominator below.
  let total = 0;
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].interval_kwh > 0) total += rows[i].interval_kwh;
  }
  const hours =
    (new Date(rows[rows.length - 1].timestamp) - new Date(rows[0].timestamp)) /
    3_600_000;
  if (hours <= 0) return 0;
  return (total / hours) * HOURS_PER_MONTH;
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);
  const rows = await readings
    .find(
      { dataid, timestamp: { $gte: thirtyDaysAgo } },
      {
        projection: {
          _id: 0,
          timestamp: 1,
          interval_kwh: 1,
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

  // Per-interval consumption tagged with hour/month, for the TOU split. Uses the
  // precomputed interval_kwh on each reading.
  const intervals = [];
  for (const r of rows) {
    const consumption = r.interval_kwh;
    if (!(consumption > 0)) continue;
    const ts = new Date(r.timestamp);
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

/**
 * Compares a customer's average power draw against all customers on the same
 * rate plan type (TOU vs tiered), returning their percentile rank.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {number} dataid the meter/customer id
 * @returns {Promise<object|null>}
 */
export async function getUsageSegment(db, dataid) {
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);
  const readings  = db.collection(READINGS_COLLECTION_NAME);
  const tariffs   = db.collection(TARIFFS_COLLECTION_NAME);

  const customer = await customers.findOne(
    { dataid },
    { projection: { _id: 0, city: 1, state: 1 } }
  );
  if (!customer) return null;

  const locationLabel = toLocationLabel(customer.city, customer.state);
  const tariff = await tariffs.findOne(
    { location_label: locationLabel },
    { projection: { _id: 0, rate_type: 1, rateName: 1 } }
  );
  if (!tariff) return null;

  // All customers on the same rate_type form the segment.
  const [matchingTariffs, allCustomers] = await Promise.all([
    tariffs
      .find({ rate_type: tariff.rate_type }, { projection: { _id: 0, location_label: 1 } })
      .toArray(),
    customers
      .find({}, { projection: { _id: 0, dataid: 1, city: 1, state: 1 } })
      .toArray(),
  ]);

  const segmentLabels = new Set(matchingTariffs.map((t) => t.location_label));
  const segmentDataids = allCustomers
    .filter((c) => segmentLabels.has(toLocationLabel(c.city, c.state)))
    .map((c) => c.dataid);

  // Average power per customer over the last 7 days, with DB-side percentile rank.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
  const usageRows = await readings
    .aggregate([
      { $match: { dataid: { $in: segmentDataids }, timestamp: { $gte: sevenDaysAgo } } },
      { $group: { _id: "$dataid", avgPower: { $avg: "$avg_reading" } } },
      { $setWindowFields: {
        sortBy: { avgPower: 1 },
        output: { percentile: { $percentRank: {} } },
      }},
    ])
    .toArray();

  const thisCustomer = usageRows.find((u) => u._id === dataid);
  if (!thisCustomer) return null;

  const segmentAvg = usageRows.reduce((s, u) => s + u.avgPower, 0) / usageRows.length;

  return {
    dataid,
    percentile: Math.round(thisCustomer.percentile * 100),
    segmentName: tariff.rateName ?? (tariff.rate_type === "tou" ? "Time-of-Use" : "Tiered Rate"),
    segmentSize: usageRows.length,
    customerAvgW: Math.round(thisCustomer.avgPower),
    segmentAvgW:  Math.round(segmentAvg),
  };
}

/**
 * Quick insights for one customer: their estimated monthly consumption and the
 * hour of day when they typically draw the most power (their peak time).
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {number} dataid the meter/customer id
 * @returns {Promise<{ monthlyKwh: number|null, peakHour: number|null, peakKw: number|null }|null>}
 */
export async function getCustomerInsights(db, dataid) {
  const readings = db.collection(READINGS_COLLECTION_NAME);

  const rows = await readings
    .find({ dataid }, { projection: { _id: 0, timestamp: 1, interval_kwh: 1 } })
    .sort({ timestamp: 1 })
    .toArray();
  if (!rows.length) return null;

  const monthlyKwh = estimateMonthlyKwh(rows);

  // Peak time = hour of day with the highest average power draw.
  const [peak] = await readings
    .aggregate([
      { $match: { dataid } },
      { $group: { _id: { $hour: "$timestamp" }, avgPower: { $avg: "$power" } } },
      { $sort: { avgPower: -1 } },
      { $limit: 1 },
    ])
    .toArray();

  return {
    monthlyKwh: monthlyKwh != null ? Math.round(monthlyKwh) : null,
    peakHour: peak ? peak._id : null,
    peakKw:
      peak && peak.avgPower != null
        ? Math.round((peak.avgPower / 1000) * 100) / 100
        : null,
  };
}

const APPLIANCE_KEYS = [
  { key: "hvac_power",     label: "HVAC" },
  { key: "heating_power",  label: "Heating" },
  { key: "kitchen_power",  label: "Kitchen" },
  { key: "laundry_power",  label: "Laundry" },
  { key: "env_power",      label: "Environmental" },
  { key: "ev_power",       label: "Electric Vehicle" },
];

/**
 * Average power draw per appliance category for a single customer, computed
 * across all their readings. Includes the latest snapshot values and an "other"
 * slice representing unmetered load (total power − sum of named appliances).
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @param {number} dataid the meter/customer id
 * @returns {Promise<object|null>}
 */
export async function getApplianceUsage(db, dataid) {
  const readings = db.collection(READINGS_COLLECTION_NAME);

  const [agg, latest] = await Promise.all([
    readings
      .aggregate([
        { $match: { dataid } },
        {
          $group: {
            _id: null,
            hvac_power:     { $avg: "$hvac_power" },
            heating_power:  { $avg: "$heating_power" },
            kitchen_power:  { $avg: "$kitchen_power" },
            laundry_power:  { $avg: "$laundry_power" },
            env_power:      { $avg: "$env_power" },
            ev_power:       { $avg: "$ev_power" },
            avg_total:      { $avg: "$power" },
            has_ev:         { $max: { $cond: ["$has_ev", 1, 0] } },
            count:          { $sum: 1 },
          },
        },
      ])
      .next(),
    readings.findOne(
      { dataid },
      {
        sort: { timestamp: -1 },
        projection: {
          _id: 0, timestamp: 1,
          hvac_power: 1, heating_power: 1, kitchen_power: 1,
          laundry_power: 1, env_power: 1, ev_power: 1, power: 1,
        },
      }
    ),
  ]);

  if (!agg) return null;

  const hasEv = agg.has_ev === 1;
  const activeKeys = hasEv ? APPLIANCE_KEYS : APPLIANCE_KEYS.filter((a) => a.key !== "ev_power");

  const applianceSum = activeKeys.reduce((s, a) => s + (agg[a.key] ?? 0), 0);
  const totalAvg = agg.avg_total ?? applianceSum;
  const other = Math.max(0, totalAvg - applianceSum);

  const rows = [
    ...activeKeys.map((a) => ({ key: a.key, label: a.label, avgWatts: Math.round(agg[a.key] ?? 0) })),
    ...(other > 0.5 ? [{ key: "other", label: "Other", avgWatts: Math.round(other) }] : []),
  ].sort((a, b) => b.avgWatts - a.avgWatts);

  const totalAvgWatts = Math.round(totalAvg);

  return {
    dataid,
    hasEv,
    readingCount: agg.count,
    totalAvgWatts,
    appliances: rows.map((a) => ({
      ...a,
      pct: totalAvgWatts > 0 ? Math.round((a.avgWatts / totalAvgWatts) * 1000) / 10 : 0,
    })),
    latest: latest
      ? {
          timestamp: latest.timestamp,
          hvac_power:    latest.hvac_power,
          heating_power: latest.heating_power,
          kitchen_power: latest.kitchen_power,
          laundry_power: latest.laundry_power,
          env_power:     latest.env_power,
          ev_power:      latest.ev_power,
          power:         latest.power,
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

  // Only the recent window — the dataset spans weeks, but the trend chart should
  // show a readable slice (a saturated axis of thousands of points is unusable).
  const TREND_LOOKBACK_MS = 2 * 86_400_000;
  const latest = await readings.findOne(
    { dataid },
    { projection: { _id: 0, timestamp: 1 }, sort: { timestamp: -1 } }
  );
  const windowStart = latest?.timestamp
    ? new Date(new Date(latest.timestamp).getTime() - TREND_LOOKBACK_MS)
    : null;

  const rows = await readings
    .find(
      {
        dataid: { $in: ids },
        ...(windowStart ? { timestamp: { $gte: windowStart } } : {}),
      },
      { projection: { _id: 0, dataid: 1, timestamp: 1, interval_kwh: 1 } }
    )
    .sort({ dataid: 1, timestamp: 1 })
    .toArray();

  // Group readings by meter, then bucket their precomputed interval_kwh.
  const byMeter = new Map();
  for (const row of rows) {
    if (!byMeter.has(row.dataid)) byMeter.set(row.dataid, []);
    byMeter.get(row.dataid).push(row);
  }

  // Per meter: map of 15-min bucket -> summed consumption. Bucketing to a fixed
  // display cadence keeps the chart stable no matter the raw reading cadence:
  // 1-second live readings roll up into the current 15-min bucket instead of
  // flooding the axis with thousands of near-zero points.
  const DISPLAY_BUCKET_MS = 15 * 60 * 1000;
  const bucketOf = (ts) =>
    new Date(
      Math.floor(new Date(ts).getTime() / DISPLAY_BUCKET_MS) * DISPLAY_BUCKET_MS
    ).toISOString();

  const consumptionByMeter = new Map();
  const allTimestamps = new Set();
  for (const [id, list] of byMeter) {
    const map = new Map();
    for (const row of list) {
      const consumption = row.interval_kwh;
      if (!(consumption > 0)) continue;
      const bucket = bucketOf(row.timestamp);
      map.set(bucket, (map.get(bucket) ?? 0) + consumption);
      allTimestamps.add(bucket);
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
