import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getCustomers } from "@/lib/db/customers";

const dbName = process.env.DATABASE_NAME;

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const customers = await getCustomers(db);

    return NextResponse.json({ customers });
  } catch (error) {
    console.error("Error fetching customers:", error);
    return NextResponse.json(
      { customers: [], error: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
