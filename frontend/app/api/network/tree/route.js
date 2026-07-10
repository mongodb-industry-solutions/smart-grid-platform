import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getNetworkTree } from "@/lib/db/networkTree";

const dbName = process.env.DATABASE_NAME;

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const result = await getNetworkTree(db);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching network tree:", error);
    return NextResponse.json(
      { tree: [], error: "Failed to fetch network tree" },
      { status: 500 }
    );
  }
}
