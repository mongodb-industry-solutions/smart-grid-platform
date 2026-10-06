// Step definitions for the Time-Series Explorer walkthrough.
// Each step progressively reveals a MongoDB time-series concept,
// mirroring the "connected factory" progressive-disclosure pattern.

export const TIME_SERIES_STEPS = [
  {
    id: "reading",
    num: 1,
    title: "The Reading",
    sentence:
      "One smart-meter reading: voltage, current, power, and a timestamp.",
    collection: "readings",
    pipeline: [
      {
        $match: { voltage: { $ne: null } },
      },
      { $sort: { timestamp: -1 } },
      { $limit: 1 },
    ],
    description:
      "Every 15 minutes each meter writes a document. This is what one looks like — raw measurements plus the grid context denormalized onto the reading.",
  },
  {
    id: "context",
    num: 2,
    title: "The Context",
    sentence:
      "One reading enriched with its grid position: which feeder, substation, and utility it belongs to.",
    collection: "readings",
    pipeline: [
      {
        $match: { voltage: { $ne: null } },
      },
      { $sort: { timestamp: -1 } },
      { $limit: 1 },
      {
        $lookup: {
          from: "meter_network_map",
          localField: "dataid",
          foreignField: "dataid",
          as: "grid_position",
        },
      },
      {
        $unwind: "$grid_position",
      },
    ],
    prevStepId: "reading",
    description:
      "$lookup joins the reading to the network map — now we know this meter sits on feeder F-12, substation SUB-003, under utility U-TX-001. One document, full context.",
  },
  {
    id: "anomaly",
    num: 3,
    title: "The Anomaly",
    star: true,
    sentence:
      "Flag readings that deviate beyond 2 standard deviations from the meter's own baseline.",
    collection: "readings",
    pipeline: [
      {
        $match: { voltage: { $ne: null } },
      },
      {
        $group: {
          _id: "$dataid",
          avg_power: { $avg: "$power" },
          std_power: { $stdDevSamp: "$power" },
          readings: { $push: { power: "$power", timestamp: "$timestamp" } },
        },
      },
      { $limit: 5 },
      {
        $project: {
          dataid: "$_id",
          avg_power: { $round: ["$avg_power", 2] },
          std_power: { $round: ["$std_power", 2] },
          anomaly_count: {
            $size: {
              $filter: {
                input: "$readings",
                as: "r",
                cond: {
                  $gt: [
                    { $abs: { $subtract: ["$$r.power", "$avg_power"] } },
                    { $multiply: ["$std_power", 2] },
                  ],
                },
              },
            },
          },
        },
      },
    ],
    prevStepId: "context",
    description:
      "$group computes each meter's baseline (mean and standard deviation), then $filter flags outliers — all inside the database, no application-side stats library needed.",
  },
  {
    id: "demand",
    num: 4,
    title: "Regional Demand",
    sentence:
      "Aggregate all meters by region and hour to see expected demand with confidence intervals.",
    collection: "readings",
    pipeline: [
      {
        $match: { voltage: { $ne: null } },
      },
      {
        $group: {
          _id: { region: "$state", period: "$timestamp" },
          demand_kw: { $sum: { $divide: ["$power", 1000] } },
        },
      },
      {
        $group: {
          _id: { region: "$_id.region", hour: { $hour: "$_id.period" } },
          expected_kw: { $avg: "$demand_kw" },
          std_dev: { $stdDevSamp: "$demand_kw" },
          samples: { $sum: 1 },
        },
      },
      { $sort: { "_id.region": 1, "_id.hour": 1 } },
    ],
    prevStepId: "anomaly",
    description:
      "Two $group stages: first coincident demand per region per period, then average by hour-of-day with $stdDevSamp for the confidence band. This is the pipeline behind the Forecasting page.",
  },
  {
    id: "stability",
    num: 5,
    title: "Grid Stability",
    sentence:
      "Roll feeder load up to substations and compare against rated capacity.",
    collection: "latest_readings",
    pipeline: [
      {
        $group: {
          _id: "$feeder_id",
          total_power_w: { $sum: "$power" },
          meter_count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "network",
          localField: "_id",
          foreignField: "feeder_id",
          as: "feeder",
        },
      },
      { $unwind: { path: "$feeder", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          feeder_id: "$_id",
          load_kw: { $round: [{ $divide: ["$total_power_w", 1000] }, 2] },
          capacity_kw: "$feeder.capacity_kw",
          utilization_pct: {
            $round: [
              {
                $multiply: [
                  { $divide: ["$total_power_w", { $multiply: ["$feeder.capacity_kw", 1000] }] },
                  100,
                ],
              },
              1,
            ],
          },
          meter_count: 1,
        },
      },
      { $sort: { utilization_pct: -1 } },
      { $limit: 10 },
    ],
    prevStepId: "demand",
    description:
      "$group rolls live power up to the feeder level, $lookup brings in rated capacity from the network collection, and $project computes utilization percentage — the same query that drives the Grid Stability card.",
  },
  {
    id: "timeseries",
    num: 6,
    title: "Why Time-Series",
    sentence:
      "MongoDB time-series collections bucket readings automatically — same query, smaller storage, faster scans.",
    collection: "readings",
    pipeline: [
      {
        $match: {
          voltage: { $ne: null },
        },
      },
      {
        $group: {
          _id: {
            meter: "$dataid",
            day: { $dateTrunc: { date: "$timestamp", unit: "day" } },
          },
          min_voltage: { $min: "$voltage" },
          max_voltage: { $max: "$voltage" },
          avg_power: { $avg: "$power" },
          reading_count: { $sum: 1 },
        },
      },
      { $sort: { "_id.day": -1 } },
      { $limit: 10 },
    ],
    prevStepId: "stability",
    description:
      "Time-series collections store measurements in compressed buckets keyed by metadata and time. The aggregation framework scans buckets instead of individual documents — $dateTrunc bins by day, $min/$max/$avg summarize efficiently.",
  },
];
