import getMongoClientPromise from "@/lib/mongodb";
import { isFeederRunning } from "@/lib/demo/feeder";

const dbName = process.env.DATABASE_NAME;
const READINGS = process.env.READINGS_COLLECTION_NAME || "readings";

// Whether the demo data is present, so the Start Demo modal only appears when
// the cluster is empty (fresh setup) and stays out of the way afterwards.
export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const count = await db.collection(READINGS).estimatedDocumentCount();
    const meta = await db.collection("demo_meta").findOne({ _id: "seed" });
    return Response.json({
      seeded: count > 0,
      readingsCount: count,
      generatedAt: meta?.generatedAt ?? null,
      feederRunning: await isFeederRunning(),
    });
  } catch (error) {
    return Response.json(
      { seeded: false, readingsCount: 0, feederRunning: false, error: error.message },
      { status: 200 }
    );
  }
}
