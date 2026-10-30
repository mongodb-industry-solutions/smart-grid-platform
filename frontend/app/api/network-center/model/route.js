import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getNetworkComponentModel } from "@/lib/db/networkModel";
import { cached } from "@/lib/cache/ttlCache";

const dbName = process.env.DATABASE_NAME;
// The data model is documentation-like and changes rarely.
const MODEL_TTL_MS = 30_000;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const component = searchParams.get("component") || "stability";

    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const data = await cached(`network-model:${component}`, MODEL_TTL_MS, () =>
      getNetworkComponentModel(db, component)
    );
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching network model:", error);
    return NextResponse.json(
      { error: "Failed to fetch data model" },
      { status: 500 }
    );
  }
}
