import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getCustomerDetail } from "@/lib/db/customers";

const dbName = process.env.DATABASE_NAME;

export async function GET(request, { params }) {
  try {
    const { dataid } = await params;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const customer = await getCustomerDetail(db, Number(dataid));

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Error fetching customer detail:", error);
    return NextResponse.json(
      { customer: null, error: "Failed to fetch customer detail" },
      { status: 500 }
    );
  }
}
