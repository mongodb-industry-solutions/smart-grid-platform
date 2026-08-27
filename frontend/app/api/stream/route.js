import getMongoClientPromise from "@/lib/mongodb";

export const dynamic = "force-dynamic";

const dbName = process.env.DATABASE_NAME;
const readingsCollection = process.env.READINGS_COLLECTION_NAME || "readings";

const HEARTBEAT_INTERVAL_MS = 15_000;

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
        const client = await getMongoClientPromise();
        const db = client.db(dbName);
        const col = db.collection(readingsCollection);

        changeStream = col.watch(
          [{ $match: { operationType: "insert" } }],
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
