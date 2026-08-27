import { MongoClient, ServerApiVersion } from "mongodb";

export const dynamic = "force-dynamic";

const dbName = process.env.DATABASE_NAME;
const readingsCollection = process.env.READINGS_COLLECTION_NAME || "readings";

const HEARTBEAT_INTERVAL_MS = 15_000;

// Change Streams are long-lived cursors that wait indefinitely for new events.
// The shared MongoClient has a 20s CSOT that kills idle cursors. Use a dedicated
// client without timeoutMS for the stream endpoint.
let _streamClient;
function getStreamClient() {
  if (!_streamClient) {
    _streamClient = new MongoClient(process.env.MONGODB_URI, {
      appName: "smartgrid-stream",
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
    });
  }
  return _streamClient;
}

/**
 * SSE endpoint backed by a MongoDB Change Stream on the readings collection.
 * Pushes new readings to connected clients as they are inserted by the feeder,
 * replacing per-component polling with a single persistent cursor.
 */
export async function GET(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let changeStream;
      let heartbeat;
      let closed = false;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (changeStream) changeStream.close().catch(() => {});
      };

      // Close when the client disconnects.
      request.signal.addEventListener("abort", cleanup);

      try {
        const client = getStreamClient();
        const db = client.db(dbName);

        // Time-series collections are internally views — Change Streams can't
        // be opened on views directly. Watch the database instead and filter
        // for inserts into the readings namespace.
        changeStream = db.watch(
          [{ $match: {
            operationType: "insert",
            "ns.coll": readingsCollection,
          } }],
          { fullDocument: "updateLookup", batchSize: 500 }
        );

        // Heartbeat keeps the connection alive through proxies/load balancers.
        heartbeat = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          } catch {
            cleanup();
          }
        }, HEARTBEAT_INTERVAL_MS);

        // Buffer inserts that arrive in the same tick into a single SSE event.
        let buffer = [];
        let flushTimer = null;

        const flush = () => {
          if (closed || buffer.length === 0) return;
          const batch = buffer;
          buffer = [];
          try {
            const data = JSON.stringify({
              type: "readings",
              timestamp: new Date().toISOString(),
              readings: batch,
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            cleanup();
          }
        };

        for await (const change of changeStream) {
          if (closed) break;
          const doc = change.fullDocument;
          if (!doc) continue;

          // Strip MongoDB internals, keep reading fields.
          const { _id, ...reading } = doc;
          buffer.push(reading);

          // Flush after a short debounce (50ms) so a feeder batch of N inserts
          // arrives as one SSE event rather than N individual messages.
          if (!flushTimer) {
            flushTimer = setTimeout(() => {
              flushTimer = null;
              flush();
            }, 50);
          }
        }
      } catch (err) {
        if (!closed) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`)
            );
          } catch {
            // controller already closed
          }
        }
      } finally {
        cleanup();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
