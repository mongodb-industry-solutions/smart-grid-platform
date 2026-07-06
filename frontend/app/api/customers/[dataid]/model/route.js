import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getComponentModel } from "@/lib/db/customersModel";

const dbName = process.env.DATABASE_NAME;

export async function GET(request, { params }) {
  try {
    const { dataid } = await params;
    const { searchParams } = new URL(request.url);
    const component = searchParams.get("component") || "list";

    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const data = await getComponentModel(db, component, Number(dataid));
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching component model:", error);
    return NextResponse.json(
      { error: "Failed to fetch data model" },
      { status: 500 }
    );
  }
}
