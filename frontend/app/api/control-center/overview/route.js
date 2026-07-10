import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getControlCenterOverview } from "@/lib/db/controlCenter";

const dbName = process.env.DATABASE_NAME;

export async function GET(request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope") || "all";

    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const overview = await getControlCenterOverview(db, { scope });

    return NextResponse.json(overview);
  } catch (error) {
    console.error("Error fetching control-center overview:", error);
    return NextResponse.json(
      { error: "Failed to fetch control-center overview" },
      { status: 500 }
    );
  }
}
