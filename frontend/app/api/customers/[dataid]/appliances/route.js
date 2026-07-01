import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getApplianceUsage } from "@/lib/db/customers";

const dbName = process.env.DATABASE_NAME;

export async function GET(request, { params }) {
  try {
    const { dataid } = await params;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const data = await getApplianceUsage(db, Number(dataid));
    if (!data) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching appliance usage:", error);
    return NextResponse.json(
      { error: "Failed to fetch appliance usage" },
      { status: 500 }
    );
  }
}
