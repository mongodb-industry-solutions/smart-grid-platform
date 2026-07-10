import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getNetworkCenterOverview } from "@/lib/db/networkCenter";

const dbName = process.env.DATABASE_NAME;

export async function GET(request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope") || "all";

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const overview = await getNetworkCenterOverview(db, { scope });

    return NextResponse.json(overview);
  } catch (error) {
    console.error("Error fetching network-center overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch network-center overview" },
      { status: 500 }
    );
  }
}
