import { NextResponse } from "next/server";
import getMongoClientPromise from "@/lib/mongodb";
import { getOutagesSummary } from "@/lib/db/outages";
import { sameOriginOk } from "@/lib/http/sameOrigin";

const dbName = process.env.DATABASE_NAME;
const READINGS = process.env.READINGS_COLLECTION_NAME || "readings";

export async function GET() {
  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);

    const summary = await getOutagesSummary(db);

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Error fetching outages data:", error);
    return NextResponse.json(
      { summary: null, error: "Failed to fetch outages data" },
      { status: 500 }
    );
  }
}

// Injects a full outage for one meter: appends a reading with zeroed electrical
// values (power <= 0) at the meter's latest reading period, carrying its grid
// context so the map and outage summaries pick it up as a real outage.
//
// We append rather than update the meter's existing latest reading: `readings`
// is a time-series collection, and this Atlas server only allows updates/deletes
// filtered on the metaField (`dataid`) alone — never on `timestamp`. So there is
// no way to target and overwrite a single measurement; the outage lives as an
// extra doc at the same period. The only affected aggregations are doc-count ones
// (grid-stability meter_count, recent-readings), where the impact is +1 for that
// one meter — cosmetic and acceptable for a demo injection.
export async function POST(request) {
  if (!sameOriginOk(request)) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* no body */
  }
  const id = Number(body.dataid);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "A numeric dataid is required." }, { status: 400 });
  }

  try {
    const client = await getMongoClientPromise();
    const db = client.db(dbName);
    const readings = db.collection(READINGS);

    // Copy the meter's latest reading for its grid context + cumulative energy.
    const last = await readings.findOne(
      { dataid: id },
      { sort: { timestamp: -1 }, projection: { _id: 0 } }
    );
    if (!last) {
      return NextResponse.json({ error: `No readings found for meter ${id}.` }, { status: 404 });
    }

    // Use the meter's own latest reading time (the current data period), NOT the
    // real wall clock: the dataset is anchored to whenever it was generated, so
    // inserting at "now" would push the newest timestamp into an empty future and
    // break every panel that anchors to the latest reading.
    const ts = last.timestamp ? new Date(last.timestamp) : new Date();
    await readings.insertOne({
      dataid: id,
      timestamp: ts,
      // Full outage — everything electrical drops to zero.
      avg_reading: 0, voltage: 0, volt_leg_1: 0, volt_leg_2: 0,
      current: 0, power: 0, power_factor: 0, frequency: 0,
      hvac_power: 0, heating_power: 0, kitchen_power: 0,
      laundry_power: 0, ev_power: 0, env_power: 0,
      interval_kwh: 0,
      energy: last.energy ?? 0, // cumulative register carries over
      has_ev: !!last.has_ev,
      // Grid context, denormalized (same as every reading).
      utility_id: last.utility_id,
      substation_id: last.substation_id,
      feeder_id: last.feeder_id,
      transformer_id: last.transformer_id,
      state: last.state,
      city: last.city,
      // Tag it so it's identifiable as a manually injected outage.
      grid_event_id: `MANUAL-${Date.now()}`,
      grid_event_label: "manual_outage",
    });

    return NextResponse.json({
      ok: true,
      dataid: id,
      city: last.city,
      state: last.state,
      feeder_id: last.feeder_id,
      substation_id: last.substation_id,
      transformer_id: last.transformer_id,
    });
  } catch (error) {
    console.error("Error adding outage:", error);
    return NextResponse.json({ error: "Failed to add outage." }, { status: 500 });
  }
}
