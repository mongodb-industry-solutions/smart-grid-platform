import { MongoClient, ServerApiVersion } from "mongodb";

// A single upstream Change Stream on latest_readings, fanned out to every
// connected SSE client.
//
// Previously each /api/stream connection opened its own change-stream cursor,
// so the number of server-side cursors (and the work the server did to feed
// them) grew linearly with the number of viewers — fine for one browser, rough
// for a room full of people watching the same demo. Here there is exactly one
// cursor per server process, and every viewer is a cheap in-process subscriber.
//
// The hub is a per-process singleton: Next.js keeps module state alive across
// requests in the same server process, which is what we want. (Deployment is a
// single replica, so "per process" == "per deployment".)

const dbName = process.env.DATABASE_NAME;
const COLLECTION = "latest_readings";

// Coalesce a feeder batch (N upserts in one tick) into one SSE event.
const FLUSH_DEBOUNCE_MS = 50;
// Keep the upstream cursor open briefly after the last viewer leaves, so a page
// reload or a brief reconnect doesn't tear it down and immediately rebuild it.
const IDLE_TEARDOWN_MS = 15_000;
// Delay before reconnecting the upstream after an error.
const RECONNECT_DELAY_MS = 1_000;

let hub = null;

function createHub() {
  const subscribers = new Set();

  let client = null;
  let cursor = null;
  let running = false;
  let stopRequested = false;
  let flushTimer = null;
  let buffer = [];
  let teardownTimer = null;
  let reconnectTimer = null;

  function broadcast(payload) {
    for (const send of subscribers) {
      try {
        send(payload);
      } catch {
        // The subscriber's controller is gone; it unsubscribes via abort.
      }
    }
  }

  function flush() {
    flushTimer = null;
    if (buffer.length === 0) return;
    const readings = buffer;
    buffer = [];
    broadcast({ type: "readings", timestamp: new Date().toISOString(), readings });
  }

  // Opens the client + cursor and pumps changes until the cursor ends or an
  // error is thrown. Assumes `running` is already true.
  async function pump() {
    // Dedicated client without timeoutMS: change streams are long-lived cursors
    // and the shared client's 20s CSOT would kill them when idle.
    client = new MongoClient(process.env.MONGODB_URI, {
      appName: "smartgrid-stream",
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
    });
    await client.connect();

    // latest_readings is a regular collection (one doc per meter, upserted by
    // the feeder each tick). Time-series collections don't support Change
    // Streams, so this derived collection is the real-time push source.
    const col = client.db(dbName).collection(COLLECTION);
    cursor = col.watch(
      [{ $match: { operationType: { $in: ["insert", "replace", "update"] } } }],
      { fullDocument: "updateLookup", batchSize: 500 }
    );

    for await (const change of cursor) {
      if (stopRequested) break;
      const doc = change.fullDocument;
      if (!doc) continue;
      const { _id, ...reading } = doc; // strip Mongo internals
      buffer.push(reading);
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_DEBOUNCE_MS);
    }
  }

  async function teardown() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    buffer = [];
    if (cursor) {
      const c = cursor;
      cursor = null;
      try {
        await c.close();
      } catch {
        /* already closed */
      }
    }
    if (client) {
      const cl = client;
      client = null;
      try {
        await cl.close();
      } catch {
        /* already closed */
      }
    }
  }

  async function run() {
    if (running) return;
    running = true;
    stopRequested = false;
    try {
      await pump();
    } catch (err) {
      broadcast({ type: "error", message: err.message });
    } finally {
      const wasStopped = stopRequested;
      await teardown();
      running = false;
      // Reconnect unless we stopped on purpose (idle teardown) or everyone left.
      if (!wasStopped && subscribers.size > 0) {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (subscribers.size > 0 && !running) run();
        }, RECONNECT_DELAY_MS);
      }
    }
  }

  function scheduleIdleTeardown() {
    if (teardownTimer) return;
    teardownTimer = setTimeout(() => {
      teardownTimer = null;
      if (subscribers.size > 0) return;
      stopRequested = true;
      // Closing the cursor ends the for-await loop → run()'s finally → teardown.
      if (cursor) cursor.close().catch(() => {});
    }, IDLE_TEARDOWN_MS);
  }

  return {
    subscribe(send) {
      if (teardownTimer) {
        clearTimeout(teardownTimer);
        teardownTimer = null;
      }
      subscribers.add(send);
      if (!running) run();
      return () => {
        subscribers.delete(send);
        if (subscribers.size === 0) scheduleIdleTeardown();
      };
    },
    subscriberCount: () => subscribers.size,
  };
}

function getHub() {
  if (!hub) hub = createHub();
  return hub;
}

/**
 * Subscribe to live readings. `send(payload)` is called with each event
 * (`{ type: "readings", timestamp, readings }` or `{ type: "error", message }`).
 * Returns an unsubscribe function.
 */
export function subscribeToReadings(send) {
  return getHub().subscribe(send);
}

export function streamSubscriberCount() {
  return getHub().subscriberCount();
}
