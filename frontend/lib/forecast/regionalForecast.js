// Pure, DB-free seasonal forecast for one region's demand series. MVP model:
// a recent moving-average level scaled by an hour-of-day and a day-of-week
// factor (both learned from the region's own history). Produces one combined
// series with distinct historical (actual) and forecast portions, the predicted
// peak, its % of capacity, and a trend vs the prior period.
//
// Seasonality is computed here (not in Mongo) so profiling and projection share
// one clock. Default clock is UTC, matching the existing demandPipeline's $hour.

const CADENCE_MINUTES = 15; // readings cadence
const MS_PER_MIN = 60_000;

// Feeder-utilization severity bands, reused from the Grid Stability card.
export function severityFor(pct) {
  if (pct == null) return null;
  if (pct >= 90) return "critical";
  if (pct >= 70) return "elevated";
  return "normal";
}

const round = (v, d = 2) => {
  if (v == null || Number.isNaN(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

const mean = (arr) =>
  arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

// Hour-of-day (0–23) and day-of-week (0–6) in the configured zone. UTC only for
// the MVP; a tz-aware variant would swap these for Intl.DateTimeFormat parts.
function hourOf(date /* Date */) {
  return date.getUTCHours();
}
function dowOf(date /* Date */) {
  return date.getUTCDay();
}

/**
 * @param {Object} args
 * @param {Array<{period: Date|string, demand_kw: number}>} args.series historical, any order
 * @param {number|null} args.capacity_kw region's rated capacity
 * @param {number} [args.horizonHours=24] how far ahead to project
 * @param {number} [args.maRecentHours=24] trailing window for the level (MA)
 */
export function forecastRegion({
  series = [],
  capacity_kw = null,
  horizonHours = 24,
  maRecentHours = 24,
}) {
  // Normalize + sort ascending.
  const hist = series
    .map((p) => ({ t: new Date(p.period), v: Number(p.demand_kw) || 0 }))
    .filter((p) => !Number.isNaN(p.t.getTime()))
    .sort((a, b) => a.t - b.t);

  const sampleCount = hist.length;
  const hasCapacity = typeof capacity_kw === "number" && capacity_kw > 0;

  if (sampleCount === 0) {
    return {
      capacity_kw: hasCapacity ? capacity_kw : null,
      hasCapacity,
      sampleCount: 0,
      series: [],
      peak: null,
      avgPctCapacity: null,
      trend: null,
    };
  }

  const values = hist.map((p) => p.v);
  const overallMean = mean(values);

  // Seasonal factors as ratios to the overall mean; empty/degenerate → 1.
  const bucketFactor = (keyFn, size) => {
    const sums = new Array(size).fill(0);
    const counts = new Array(size).fill(0);
    for (const p of hist) {
      const k = keyFn(p.t);
      sums[k] += p.v;
      counts[k] += 1;
    }
    return sums.map((s, i) =>
      counts[i] > 0 && overallMean > 0 ? s / counts[i] / overallMean : 1
    );
  };
  const hourFactor = bucketFactor((t) => hourOf(t), 24);
  const dowFactor = bucketFactor((t) => dowOf(t), 7);

  // Level = mean of the trailing window (recent conditions), fallback to all.
  // Select by real elapsed time, not a fixed point count, so a burst of
  // high-frequency live readings can't shrink the window to a few seconds.
  const lastTime = hist[hist.length - 1].t.getTime();
  const windowStart = lastTime - maRecentHours * 60 * MS_PER_MIN;
  const recentValues = hist
    .filter((p) => p.t.getTime() >= windowStart)
    .map((p) => p.v);
  const recentMA = recentValues.length ? mean(recentValues) : mean(values);

  const expectedAt = (t) =>
    overallMean > 0
      ? recentMA * hourFactor[hourOf(t)] * dowFactor[dowOf(t)]
      : recentMA;

  // Combined series: actual for history, forecast for the horizon, with the
  // last historical point bridging both lines so they visually connect.
  const combined = hist.map((p) => ({
    t: p.t.toISOString(),
    actual: round(p.v),
    forecast: null,
  }));
  if (combined.length) {
    combined[combined.length - 1].forecast =
      combined[combined.length - 1].actual;
  }

  const lastTs = hist[hist.length - 1].t;
  const steps = Math.max(1, Math.round((horizonHours * 60) / CADENCE_MINUTES));
  const forecastPts = [];
  for (let i = 1; i <= steps; i++) {
    const t = new Date(lastTs.getTime() + i * CADENCE_MINUTES * MS_PER_MIN);
    const v = Math.max(0, expectedAt(t));
    const iso = t.toISOString();
    forecastPts.push({ t: iso, value: v });
    combined.push({ t: iso, actual: null, forecast: round(v) });
  }

  // Predicted peak over the forecast horizon.
  const peakPt = forecastPts.reduce((a, b) => (b.value > a.value ? b : a));
  const peakPct = hasCapacity ? (peakPt.value / capacity_kw) * 100 : null;
  const peak = {
    t: peakPt.t,
    value: round(peakPt.value),
    pctCapacity: round(peakPct, 1),
    severity: severityFor(peakPct),
  };

  const avgForecast = mean(forecastPts.map((p) => p.value));
  const avgPctCapacity = hasCapacity
    ? round((avgForecast / capacity_kw) * 100, 1)
    : null;

  // Trend: mean of the most recent H hours of actuals vs the H hours before it.
  const trend = computeTrend(hist, horizonHours);

  return {
    capacity_kw: hasCapacity ? capacity_kw : null,
    hasCapacity,
    sampleCount,
    series: combined,
    peak,
    avgPctCapacity,
    trend,
  };
}

function computeTrend(hist, windowHours) {
  const windowMs = windowHours * 60 * MS_PER_MIN;
  const lastTs = hist[hist.length - 1].t.getTime();
  const recentStart = lastTs - windowMs;
  const priorStart = lastTs - 2 * windowMs;

  const recent = hist.filter((p) => p.t.getTime() > recentStart);
  const prior = hist.filter(
    (p) => p.t.getTime() > priorStart && p.t.getTime() <= recentStart
  );
  if (recent.length === 0 || prior.length === 0) return null;

  const recentMean = mean(recent.map((p) => p.v));
  const priorMean = mean(prior.map((p) => p.v));
  if (priorMean === 0) return null;

  const deltaPct = ((recentMean - priorMean) / priorMean) * 100;
  const direction =
    Math.abs(deltaPct) < 1 ? "flat" : deltaPct > 0 ? "up" : "down";
  return { deltaPct: round(deltaPct, 1), direction, priorMean: round(priorMean) };
}
