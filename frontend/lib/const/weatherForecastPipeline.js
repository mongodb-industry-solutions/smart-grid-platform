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

export const COMFORT_TEMP_F = 68;
export const PAST_HOURS = 24; // history hours shown (ending at "now")
export const FORECAST_HOURS = 24; // hours projected ahead

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

// Least-squares slope (through the origin) of demand residual vs. degrees
// outside the comfort band, as a $reduce over the enriched series. `side` picks
// heating (comfort − t) or cooling (t − comfort).
const slopeReduce = (comfortF, side) => {
  const x =
    side === "cooling"
      ? { $max: [0, { $subtract: ["$$this.tempF", comfortF] }] }
      : { $max: [0, { $subtract: [comfortF, "$$this.tempF"] }] };
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

/**
 * Full weather-adjusted energy forecast for one region, as ONE aggregation on
 * `readings`. Returns a single document:
 *   { points: [{ hour, label, tempF, baselineKwh, historicalKwh, forecastKwh }],
 *     nowIndex, weatherSensitivity, weatherMode, overallMean }
 *
 * @param {Object} sel
 * @param {(string|number)[]} sel.meterIds region's meter dataids (required)
 * @param {Date} [sel.from] / [sel.to] reading-timestamp window
 * @param {Array<{k:string,t:number}>} [sel.tempArray] injected hourly temps (°F),
 *   keyed by UTC hour "YYYY-MM-DDTHH"; covers history + forecast horizon
 * @param {number} [sel.comfortF]
 * @param {number} [sel.pastHours] / [sel.horizonHours]
 */
export function buildWeatherForecastPipeline(sel = {}) {
  const {
    meterIds = [],
    from,
    to,
    tempArray = [],
    comfortF = COMFORT_TEMP_F,
    pastHours = PAST_HOURS,
    horizonHours = FORECAST_HOURS,
  } = sel;
  const ids = toDataidNumbers(meterIds);
  const TEMP = { $literal: tempArray };

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
    // 1) Per-meter interval consumption from the cumulative energy register.
    {
      $setWindowFields: {
        partitionBy: "$dataid",
        sortBy: { timestamp: 1 },
        output: { prev_energy: { $shift: { output: "$energy", by: -1 } } },
      },
    },
    { $match: { prev_energy: { $ne: null } } },
    {
      $set: {
        interval_kwh: { $max: [{ $subtract: ["$energy", "$prev_energy"] }, 0] },
        hour: { $dateTrunc: { date: "$timestamp", unit: "hour" } },
      },
    },
    // 2) Total energy across all meters + intervals per hour (the true total).
    { $group: { _id: "$hour", energy_kwh: { $sum: "$interval_kwh" } } },
    { $sort: { _id: 1 } },
    // 3) Collect the hourly series into one doc + overall mean.
    {
      $group: {
        _id: null,
        series: { $push: { hour: "$_id", v: "$energy_kwh" } },
        overallMean: { $avg: "$energy_kwh" },
      },
    },
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
    // 7) Fit heating & cooling sensitivity from the region's own history.
    { $set: { _cool: slopeReduce(comfortF, "cooling"), _heat: slopeReduce(comfortF, "heating") } },
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
    // 9) Project the horizon: baseline·level + weather sensitivity·degrees-out.
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
                      tempF: tempForDate("$$t", TEMP),
                    },
                    in: {
                      $let: {
                        vars: {
                          base: { $arrayElemAt: ["$hodAvg", "$$hod"] },
                          coolingX: { $max: [0, { $subtract: [{ $ifNull: ["$$tempF", comfortF] }, comfortF] }] },
                          heatingX: { $max: [0, { $subtract: [comfortF, { $ifNull: ["$$tempF", comfortF] }] }] },
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
                                      { $multiply: ["$$base", "$levelScale"] },
                                      { $multiply: ["$coolingSlope", "$$coolingX"] },
                                      { $multiply: ["$heatingSlope", "$$heatingX"] },
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
