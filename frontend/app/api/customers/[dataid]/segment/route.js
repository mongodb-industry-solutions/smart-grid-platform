import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getUsageSegment } from "@/lib/db/customers";

const dbName = process.env.DATABASE_NAME;

export async function GET(_, { params }) {
  try {
    const { dataid } = await params;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const data = await getUsageSegment(db, Number(dataid));
    if (!data) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching usage segment:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch usage segment" },
      { status: 500 }
    );
  }
}
