import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getTariffRecommendation } from "@/lib/db/customers";

const dbName = process.env.DATABASE_NAME;

export async function GET(request, { params }) {
  try {
    const { dataid } = await params;
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const recommendation = await getTariffRecommendation(db, Number(dataid));

    if (!recommendation) {
      return NextResponse.json(
        { error: "No recommendation available" },
        { status: 404 }
      );
    }

    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error("Error fetching tariff recommendation:", error);
    return NextResponse.json(
      { recommendation: null, error: "Failed to fetch tariff recommendation" },
      { status: 500 }
    );
  }
}
