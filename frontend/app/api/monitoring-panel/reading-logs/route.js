import getMongoClientPromise from "@/lib/mongodb";

const dbName = process.env.DATABASE_NAME;
const readingsCollectionName = process.env.READINGS_COLLECTION_NAME || "readings";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const periodIndex = parseInt(searchParams.get("periodIndex") ?? "0");
  const limit       = parseInt(searchParams.get("limit") ?? "5");

  try {
    const mongoClient = await getMongoClientPromise();
    const db = mongoClient.db(dbName);
    const collection = db.collection(readingsCollectionName);

    // Get the timestamp for this period by finding the Nth distinct timestamp
    const periodDoc = await collection
      .aggregate([
        { $group: { _id: "$timestamp" } },
        { $sort:  { _id: 1 } },
        { $skip:  periodIndex },
        { $limit: 1 },
      ])
      .next();

    if (!periodDoc) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const currentTimestamp = periodDoc._id;

    const readings = await collection
      .find(
        { timestamp: currentTimestamp },
        {
          projection: {
            _id: 0,
            timestamp: 1,
            dataid: 1,
            avg_reading: 1,
            volt_leg_1: 1,
            volt_leg_2: 1,
          },
        }
      )
      .limit(limit)
      .toArray();

    return new Response(JSON.stringify(readings), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching readings from MongoDB:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
