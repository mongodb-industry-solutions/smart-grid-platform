// Readings are sampled every 15 minutes, so two outage readings belong to the
// same continuous outage when they are no more than one interval apart.
const OUTAGE_INTERVAL_MS = 15 * 60 * 1000;

const READINGS_COLLECTION_NAME =
  process.env.READINGS_COLLECTION_NAME || "readings";
const CUSTOMERS_COLLECTION_NAME =
  process.env.CUSTOMERS_COLLECTION_NAME || "customer_db";

/**
 * Computes an outage summary entirely in the database.
 *
 * An "outage" is a reading with avg_reading <= 0. The summary contains:
 *  - totalOutages: total number of outage readings.
 *  - customersWithOutage: distinct meters (dataid) that had an outage AND
 *    exist in the customers collection (joined via $lookup).
 *  - totalCustomers: total documents in the customers collection.
 *  - pctCustomersWithOutage: customersWithOutage / totalCustomers * 100.
 *  - longestOutage: the single longest continuous outage across all meters,
 *    found by grouping consecutive outage readings (gap <= one interval) into
 *    sessions with $setWindowFields. Null when there are no outages.
 *
 * @param {import("mongodb").Db} db connected MongoDB database handle
 * @returns {Promise<object>} the outage summary described above
 */
export async function getOutagesSummary(db) {
  const readings = db.collection(READINGS_COLLECTION_NAME);
  const customers = db.collection(CUSTOMERS_COLLECTION_NAME);

  const [result] = await readings
    .aggregate([
      { $match: { power: { $lte: 0 } } },
      {
        $facet: {
          // Total number of outage readings.
          totals: [{ $count: "totalOutages" }],

          // Distinct meters with an outage, kept only if they map to a real
          // customer in the customers collection.
          customers: [
            { $group: { _id: "$dataid" } },
            {
              $lookup: {
                from: CUSTOMERS_COLLECTION_NAME,
                localField: "_id",
                foreignField: "dataid",
                as: "customer",
              },
            },
            { $match: { customer: { $ne: [] } } },
            { $count: "customersWithOutage" },
          ],

          // Longest continuous outage via the "gaps and islands" pattern.
          longest: [
            { $sort: { dataid: 1, timestamp: 1 } },
            {
              $setWindowFields: {
                partitionBy: "$dataid",
                sortBy: { timestamp: 1 },
                output: {
                  prevTimestamp: {
                    $shift: { output: "$timestamp", by: -1 },
                  },
                },
              },
            },
            {
              // A new session starts on the first reading of a meter or after
              // a gap larger than one sampling interval.
              $set: {
                isNewSession: {
                  $cond: [
                    {
                      $or: [
                        { $eq: ["$prevTimestamp", null] },
                        {
                          $gt: [
                            { $subtract: ["$timestamp", "$prevTimestamp"] },
                            OUTAGE_INTERVAL_MS,
                          ],
                        },
                      ],
                    },
                    1,
                    0,
                  ],
                },
              },
            },
            {
              // Running total of session starts = a stable session id per meter.
              $setWindowFields: {
                partitionBy: "$dataid",
                sortBy: { timestamp: 1 },
                output: {
                  sessionId: {
                    $sum: "$isNewSession",
                    window: { documents: ["unbounded", "current"] },
                  },
                },
              },
            },
            {
              $group: {
                _id: { dataid: "$dataid", sessionId: "$sessionId" },
                start: { $min: "$timestamp" },
                end: { $max: "$timestamp" },
              },
            },
            {
              // Each reading covers one interval, so a single-reading outage
              // still counts as one interval of downtime.
              $set: {
                durationMs: {
                  $add: [
                    { $subtract: ["$end", "$start"] },
                    OUTAGE_INTERVAL_MS,
                  ],
                },
              },
            },
            { $sort: { durationMs: -1 } },
            { $limit: 1 },
          ],
        },
      },
    ])
    .toArray();

  const totalOutages = result?.totals[0]?.totalOutages ?? 0;
  const customersWithOutage = result?.customers[0]?.customersWithOutage ?? 0;
  const totalCustomers = await customers.countDocuments();
  const pctCustomersWithOutage = totalCustomers
    ? (customersWithOutage / totalCustomers) * 100
    : 0;

  const longestDoc = result?.longest[0];
  const longestOutage = longestDoc
    ? {
        meterId: longestDoc._id.dataid,
        durationMs: longestDoc.durationMs,
        start: longestDoc.start,
        end: longestDoc.end,
      }
    : null;

  return {
    totalOutages,
    customersWithOutage,
    totalCustomers,
    pctCustomersWithOutage,
    longestOutage,
  };
}
