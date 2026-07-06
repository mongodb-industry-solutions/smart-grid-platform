import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getCustomerInsights } from "@/lib/db/customers";

const dbName = process.env.DATABASE_NAME;

export async function GET(_, { params }) {
  try {
    const { dataid } = await params;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const data = await getCustomerInsights(db, Number(dataid));
    if (!data) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching customer insights:", error);
    return NextResponse.json(
      { error: "Failed to fetch insights" },
      { status: 500 }
    );
  }
}
