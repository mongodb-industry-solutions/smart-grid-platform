// Side-effect-free builders for the weather-adjusted energy-usage forecast.
//
// The whole forecast is computed inside a single MongoDB aggregation on the
// `readings` collection — hourly totals, the hour-of-day baseline, recent-level
// scaling, a least-squares heating/cooling sensitivity fit, and the projected
// series. The only input that can't come from Mongo is the weather (an external
// Open-Meteo call), so hourly temperatures are fetched in JS and *injected* into
// the pipeline as a literal array; every calculation on top of them runs in the
// database.
const READINGS_COLLECTION =
  process.env.NEXT_PUBLIC_READINGS_COLLECTION_NAME ||
  process.env.READINGS_COLLECTION_NAME ||
  "readings";

// Degree-day base temperatures. Following the energy-forecasting convention
// (and the AWS Amazon Forecast writeup this model is modeled on), heating and
// cooling load are driven by separate bases with a comfort "deadband" between
// them: below HEATING_BASE_F heating-degree-hours accrue, above COOLING_BASE_F
// cooling-degree-hours accrue, and in between neither does.
export const HEATING_BASE_F = 65;
export const COOLING_BASE_F = 72;
export const COMFORT_TEMP_F = 68; // deadband midpoint (kept for display/fallback)
export const PAST_HOURS = 24; // history hours shown (ending at "now")
export const FORECAST_HOURS = 24; // hours projected ahead

// History span pulled for the hour-of-day baseline and the heating/cooling
// slope fit. Set well past the ~1 week of readings so the baseline/fit use ALL
// available history (steadier per-hour and per-day-type estimates); the readings
// are a fixed historical dataset, so an over-long window just captures whatever
// exists. NOTE: this widens the baseline/fit only — the recent-level anchor
// still uses just the last PAST_HOURS.
export const DEFAULT_LOOKBACK_DAYS = 10;

// Weekday/weekend level factors are clamped to this range so a day-type with
// only a handful of hours in the 2-day window can't swing the forecast wildly.
const DAY_TYPE_CLAMP = [0.7, 1.3];

// Seam continuity: the forecast is anchored to the last actual reading and the
// model's error at "now" is carried forward, decaying exp(-(k-1)/TAU) over the
// horizon. This removes the visible step when the line switches from actual to
// forecast; TAU (hours) sets how fast it relaxes toward the pure model.
const SEAM_DECAY_TAU = 4;

// dataid is stored as a number; customer lists may arrive as text.
export function toDataidNumbers(ids) {
  return (ids ?? [])
    .map((v) => Number(v))
    .filter((v) => !Number.isNaN(v));
}

// Look up the injected temperature (°F) for a Date expression, by UTC-hour key
// ("YYYY-MM-DDTHH"). `tempLiteral` is a $literal array of { k, t }.
const tempForDate = (dateExpr, tempLiteral) => ({
  $let: {
    vars: {
      m: {
        $first: {
          $filter: {
            input: tempLiteral,
            as: "e",
            cond: {
              $eq: [
                "$$e.k",
                { $dateToString: { date: dateExpr, format: "%Y-%m-%dT%H", timezone: "UTC" } },
              ],
            },
          },
        },
      },
    },
    in: { $ifNull: ["$$m.t", null] },
  },
});

// Least-squares slope (through the origin) of demand residual vs. degree-hours
// past the relevant base, as a $reduce over the enriched series. `side` picks
// cooling (t − coolingBase, i.e. cooling-degree-hours) or heating
// (heatingBase − t, i.e. heating-degree-hours).
const slopeReduce = (baseF, side) => {
  const x =
    side === "cooling"
      ? { $max: [0, { $subtract: ["$$this.tempF", baseF] }] }
      : { $max: [0, { $subtract: [baseF, "$$this.tempF"] }] };
  return {
    $reduce: {
      input: "$series",
      initialValue: { sxx: 0, sxr: 0 },
      in: {
        $let: {
          vars: {
            x,
            resid: {
              $subtract: ["$$this.v", { $arrayElemAt: ["$hodAvg", "$$this.hod"] }],
            },
          },
          in: {
            $cond: [
              { $and: [{ $ne: ["$$this.tempF", null] }, { $gt: ["$$x", 0] }] },
              {
                sxx: { $add: ["$$value.sxx", { $multiply: ["$$x", "$$x"] }] },
                sxr: { $add: ["$$value.sxr", { $multiply: ["$$x", "$$resid"] }] },
              },
              "$$value",
            ],
          },
        },
      },
    },
  };
};

// Turn a raw {sxx,sxr} accumulation into a usable slope, falling back to a
// default sensitivity (~0.7%/°F of the baseline mean) when the region's history
// shows no fittable weather signal — the demo readings aren't weather-driven,
// so a pure fit is ~0 and the forecast would otherwise ignore temperature.
const resolveSlope = (accField) => ({
  $let: {
    vars: {
      fitted: {
        $cond: [
          { $gt: [`$${accField}.sxx`, 0] },
          { $max: [0, { $divide: [`$${accField}.sxr`, `$${accField}.sxx`] }] },
          0,
        ],
      },
      def: { $multiply: ["$overallMean", 0.007] },
    },
    in: {
      $cond: [
        { $gt: ["$$fitted", { $multiply: ["$overallMean", 0.0005] }] },
        "$$fitted",
        "$$def",
      ],
    },
  },
});

// Turn a day-type mean into a bounded level factor relative to the overall
// mean. Falls back to 1 (no adjustment) when that day type has no history in
// the window, and clamps the ratio so a tiny sample can't distort the forecast.
const dayTypeFactor = (meanField) => ({
  $let: {
    vars: {
      raw: {
        $cond: [
          { $and: [{ $ne: [meanField, null] }, { $gt: ["$overallMean", 0] }] },
          { $divide: [meanField, "$overallMean"] },
          1,
        ],
      },
    },
    in: { $min: [DAY_TYPE_CLAMP[1], { $max: [DAY_TYPE_CLAMP[0], "$$raw"] }] },
  },
});

/**
 * Full weather-adjusted energy forecast for one region, as ONE aggregation on
 * `readings`. Returns a single document:
 *   { points: [{ hour, label, tempF, baselineKwh, historicalKwh, forecastKwh }],
 *     nowIndex, weatherSensitivity, weatherMode, weekdayFactor, weekendFactor,
 *     overallMean }
 *
 * @param {Object} sel
 * @param {(string|number)[]} sel.meterIds region's meter dataids (required)
 * @param {Date} [sel.from] / [sel.to] reading-timestamp window
 * @param {Array<{k:string,t:number}>} [sel.tempArray] injected hourly temps (°F),
 *   keyed by UTC hour "YYYY-MM-DDTHH"; covers history + forecast horizon
 * @param {number} [sel.heatingBaseF] / [sel.coolingBaseF] degree-hour base temps
 * @param {number} [sel.pastHours] / [sel.horizonHours]
 */
export function buildWeatherForecastPipeline(sel = {}) {
  const {
    meterIds = [],
    from,
    to,
    tempArray = [],
    heatingBaseF = HEATING_BASE_F,
    coolingBaseF = COOLING_BASE_F,
    pastHours = PAST_HOURS,
    horizonHours = FORECAST_HOURS,
  } = sel;
  const ids = toDataidNumbers(meterIds);
  const TEMP = { $literal: tempArray };
  // Deadband midpoint: the neutral temperature used when a forecast hour has no
  // weather (both heating and cooling degree-hours are then zero).
  const midF = (heatingBaseF + coolingBaseF) / 2;

  // voltage != null excludes partial "heartbeat"/sim docs that would corrupt
  // the energy delta (see the readings-data-window note).
  const match = { dataid: { $in: ids }, voltage: { $ne: null } };
  if (from || to) {
    match.timestamp = {};
    if (from) match.timestamp.$gte = from;
    if (to) match.timestamp.$lte = to;
  }

  return [
    { $match: match },
    // 1) Per-meter interval consumption is precomputed on each reading
    //    (`interval_kwh`), so no per-meter $setWindowFields/$shift is needed.
    {
      $set: {
        interval_kwh: { $max: [{ $ifNull: ["$interval_kwh", 0] }, 0] },
        hour: { $dateTrunc: { date: "$timestamp", unit: "hour" } },
      },
    },
    // 2) Total energy across all meters + intervals per hour (the true total),
    //    plus the interval count so partial edge hours can be detected.
    { $group: { _id: "$hour", energy_kwh: { $sum: "$interval_kwh" }, n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    // 3) Collect the hourly series, then drop partial hours (incomplete interval
    //    counts — the truncated first/last hours) before computing the mean, so
    //    a half-empty final hour can't show up as a spike at the forecast seam.
    {
      $group: {
        _id: null,
        raw: { $push: { hour: "$_id", v: "$energy_kwh", n: "$n" } },
      },
    },
    // The only under-counted hours are the window's first and last (partial:
    // the window rarely starts/ends exactly on an hour boundary). Drop exactly
    // those two — cadence-agnostic, unlike comparing interval counts, which would
    // wrongly nuke every 15-min history hour once high-frequency live readings
    // inflate the max.
    {
      $set: {
        series: {
          $cond: [
            { $gt: [{ $size: "$raw" }, 2] },
            { $slice: ["$raw", 1, { $subtract: [{ $size: "$raw" }, 2] }] },
            "$raw",
          ],
        },
      },
    },
    { $set: { overallMean: { $avg: "$series.v" } } },
    // 4) Enrich each hour with hour-of-day and its injected temperature.
    {
      $set: {
        series: {
          $map: {
            input: "$series",
            as: "s",
            in: {
              hour: "$$s.hour",
              v: "$$s.v",
              hod: { $hour: { date: "$$s.hour", timezone: "UTC" } },
              // 1 = Sunday … 7 = Saturday (Mongo's $dayOfWeek).
              dow: { $dayOfWeek: { date: "$$s.hour", timezone: "UTC" } },
              tempF: tempForDate("$$s.hour", TEMP),
            },
          },
        },
      },
    },
    // 5) Hour-of-day baseline profile + the trailing window for the level.
    {
      $set: {
        hodAvg: {
          $map: {
            input: { $range: [0, 24] },
            as: "h",
            in: {
              $let: {
                vars: {
                  vals: {
                    $map: {
                      input: {
                        $filter: { input: "$series", as: "s", cond: { $eq: ["$$s.hod", "$$h"] } },
                      },
                      as: "f",
                      in: "$$f.v",
                    },
                  },
                },
                in: {
                  $cond: [{ $gt: [{ $size: "$$vals" }, 0] }, { $avg: "$$vals" }, "$overallMean"],
                },
              },
            },
          },
        },
        pastSlice: { $slice: ["$series", -pastHours] },
      },
    },
    // 6) Recent-level scaling (recent mean / overall mean).
    { $set: { recentMean: { $avg: "$pastSlice.v" } } },
    {
      $set: {
        levelScale: {
          $cond: [{ $gt: ["$overallMean", 0] }, { $divide: ["$recentMean", "$overallMean"] }, 1],
        },
      },
    },
    // 6b) Day-of-week effect (weekday vs weekend). With only a couple of days of
    //     history we can't fit a full 7-day profile, so we reduce it to a level
    //     factor per day type, relative to the overall mean and clamped so a
    //     thin sample can't distort the forecast. dow 1 (Sun) & 7 (Sat) = weekend.
    {
      $set: {
        weekdayMean: {
          $avg: {
            $map: {
              input: { $filter: { input: "$series", as: "s", cond: { $and: [{ $gte: ["$$s.dow", 2] }, { $lte: ["$$s.dow", 6] }] } } },
              as: "f",
              in: "$$f.v",
            },
          },
        },
        weekendMean: {
          $avg: {
            $map: {
              input: { $filter: { input: "$series", as: "s", cond: { $or: [{ $eq: ["$$s.dow", 1] }, { $eq: ["$$s.dow", 7] }] } } },
              as: "f",
              in: "$$f.v",
            },
          },
        },
      },
    },
    {
      $set: {
        weekdayFactor: dayTypeFactor("$weekdayMean"),
        weekendFactor: dayTypeFactor("$weekendMean"),
      },
    },
    // 7) Fit heating & cooling sensitivity from the region's own history,
    //    each against its own degree-hour base.
    { $set: { _cool: slopeReduce(coolingBaseF, "cooling"), _heat: slopeReduce(heatingBaseF, "heating") } },
    { $set: { coolingSlope: resolveSlope("_cool"), heatingSlope: resolveSlope("_heat") } },
    // 8) Build the historical points (last `pastHours`), bridging "now".
    {
      $set: {
        nowIndex: { $subtract: [{ $size: "$pastSlice" }, 1] },
        pastPoints: {
          $map: {
            input: { $range: [0, { $size: "$pastSlice" }] },
            as: "i",
            in: {
              $let: {
                vars: {
                  p: { $arrayElemAt: ["$pastSlice", "$$i"] },
                  lastI: { $subtract: [{ $size: "$pastSlice" }, 1] },
                },
                in: {
                  hour: "$$i",
                  label: {
                    $concat: [
                      { $dateToString: { date: "$$p.hour", format: "%H", timezone: "UTC" } },
                      ":00",
                    ],
                  },
                  tempF: "$$p.tempF",
                  baselineKwh: { $round: [{ $arrayElemAt: ["$hodAvg", "$$p.hod"] }, 0] },
                  historicalKwh: { $round: ["$$p.v", 0] },
                  // Bridge the actual & forecast lines at the last historical hour.
                  forecastKwh: {
                    $cond: [{ $eq: ["$$i", "$$lastI"] }, { $round: ["$$p.v", 0] }, null],
                  },
                },
              },
            },
          },
        },
      },
    },
    // 8b) Seam offset: the model's error at the last actual hour. Carried into
    //     the projection (decaying) so the forecast continues from the actual
    //     value instead of stepping to the modeled level.
    {
      $set: {
        seamOffset: {
          $let: {
            vars: { last: { $arrayElemAt: ["$pastSlice", -1] } },
            in: {
              $let: {
                vars: {
                  base: { $arrayElemAt: ["$hodAvg", "$$last.hod"] },
                  dayF: {
                    $cond: [
                      { $or: [{ $eq: ["$$last.dow", 1] }, { $eq: ["$$last.dow", 7] }] },
                      "$weekendFactor",
                      "$weekdayFactor",
                    ],
                  },
                  coolX: { $max: [0, { $subtract: [{ $ifNull: ["$$last.tempF", midF] }, coolingBaseF] }] },
                  heatX: { $max: [0, { $subtract: [heatingBaseF, { $ifNull: ["$$last.tempF", midF] }] }] },
                },
                in: {
                  $subtract: [
                    "$$last.v",
                    {
                      $add: [
                        { $multiply: ["$$base", "$levelScale", "$$dayF"] },
                        { $multiply: ["$coolingSlope", "$$coolX"] },
                        { $multiply: ["$heatingSlope", "$$heatX"] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
    // 9) Project the horizon:
    //      baseline · recent-level · day-type factor
    //      + coolingSlope · cooling-degree-hours + heatingSlope · heating-degree-hours
    //      + seam offset · exp(-(k-1)/TAU)   (continuity anchor)
    {
      $set: {
        futurePoints: {
          $map: {
            input: { $range: [1, horizonHours + 1] },
            as: "k",
            in: {
              $let: {
                vars: {
                  t: {
                    $dateAdd: {
                      startDate: { $getField: { field: "hour", input: { $arrayElemAt: ["$pastSlice", -1] } } },
                      unit: "hour",
                      amount: "$$k",
                    },
                  },
                },
                in: {
                  $let: {
                    vars: {
                      hod: { $hour: { date: "$$t", timezone: "UTC" } },
                      dow: { $dayOfWeek: { date: "$$t", timezone: "UTC" } },
                      tempF: tempForDate("$$t", TEMP),
                    },
                    in: {
                      $let: {
                        vars: {
                          base: { $arrayElemAt: ["$hodAvg", "$$hod"] },
                          dayFactor: {
                            $cond: [
                              { $or: [{ $eq: ["$$dow", 1] }, { $eq: ["$$dow", 7] }] },
                              "$weekendFactor",
                              "$weekdayFactor",
                            ],
                          },
                          // Cooling-degree-hours above the cooling base; heating-degree-hours
                          // below the heating base. In the deadband both are zero.
                          coolingX: { $max: [0, { $subtract: [{ $ifNull: ["$$tempF", midF] }, coolingBaseF] }] },
                          heatingX: { $max: [0, { $subtract: [heatingBaseF, { $ifNull: ["$$tempF", midF] }] }] },
                        },
                        in: {
                          hour: { $add: ["$nowIndex", "$$k"] },
                          label: {
                            $concat: [
                              { $dateToString: { date: "$$t", format: "%H", timezone: "UTC" } },
                              ":00",
                            ],
                          },
                          tempF: "$$tempF",
                          baselineKwh: { $round: ["$$base", 0] },
                          historicalKwh: null,
                          forecastKwh: {
                            $round: [
                              {
                                $max: [
                                  0,
                                  {
                                    $add: [
                                      { $multiply: ["$$base", "$levelScale", "$$dayFactor"] },
                                      { $multiply: ["$coolingSlope", "$$coolingX"] },
                                      { $multiply: ["$heatingSlope", "$$heatingX"] },
                                      // Continuity anchor, fading over the horizon.
                                      {
                                        $multiply: [
                                          "$seamOffset",
                                          { $exp: { $multiply: [-1, { $divide: [{ $subtract: ["$$k", 1] }, SEAM_DECAY_TAU] }] } },
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                              0,
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    // 10) Final shape: combined series + weather-sensitivity metadata.
    {
      $project: {
        _id: 0,
        points: { $concatArrays: ["$pastPoints", "$futurePoints"] },
        nowIndex: 1,
        overallMean: 1,
        weekdayFactor: { $round: ["$weekdayFactor", 2] },
        weekendFactor: { $round: ["$weekendFactor", 2] },
        weatherMode: { $cond: [{ $gte: ["$heatingSlope", "$coolingSlope"] }, "heating", "cooling"] },
        weatherSensitivity: {
          $cond: [
            { $gt: ["$overallMean", 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $divide: [{ $max: ["$coolingSlope", "$heatingSlope"] }, "$overallMean"] },
                    100,
                  ],
                },
                2,
              ],
            },
            0,
          ],
        },
      },
    },
  ];
}

/**
 * Rated capacity serving a customer region: the sum of the distinct feeders'
 * capacity_kw (from `network`) that the region's meters map to in
 * meter_network_map. Runs on meter_network_map.
 */
export function buildRegionCapacityPipeline(sel = {}) {
  const { meterIds = [], networkCollection = "network" } = sel;
  const ids = toDataidNumbers(meterIds);
  return [
    { $match: { dataid: { $in: ids } } },
    { $group: { _id: "$feeder_id" } },
    {
      $lookup: {
        from: networkCollection,
        localField: "_id",
        foreignField: "asset_id",
        as: "asset",
      },
    },
    { $unwind: "$asset" },
    { $group: { _id: null, capacity_kw: { $sum: "$asset.capacity_kw" } } },
    { $project: { _id: 0, capacity_kw: 1 } },
  ];
}
