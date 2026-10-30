import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getNetworkCenterOverview } from "@/lib/db/networkCenter";
import { cached } from "@/lib/cache/ttlCache";

const dbName = process.env.DATABASE_NAME;
const LIVE_TTL_MS = 5_000;

export async function GET(request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope") || "all";

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const overview = await cached(
      `network-center-overview:${scope}`,
      LIVE_TTL_MS,
      () => getNetworkCenterOverview(db, { scope })
    );

    return NextResponse.json(overview);
  } catch (error) {
    console.error("Error fetching network-center overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch network-center overview" },
      { status: 500 }
    );
  }
}
