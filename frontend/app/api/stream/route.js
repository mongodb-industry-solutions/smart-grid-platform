import { subscribeToReadings } from "@/lib/streaming/changeStreamHub";

export const dynamic = "force-dynamic";

// Heartbeat keeps the connection alive through proxies/load balancers.
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * SSE endpoint for live readings.
 *
 * Every viewer subscribes to the shared upstream change stream in
 * changeStreamHub — one cursor per server process, fanned out to all clients —
 * instead of each connection opening its own cursor.
 */
export async function GET(request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let heartbeat = null;
      let closed = false;

      const send = (payload) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const unsubscribe = subscribeToReadings(send);

      // Flush the response headers immediately. Next.js doesn't send them until
      // the first body write, so without this the browser's EventSource would
      // stay in "connecting" until the first event or the 15s heartbeat.
      try {
        controller.enqueue(encoder.encode(": connected\n\n"));
      } catch {
        /* controller already closed */
      }

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_INTERVAL_MS);

      // Close when the client disconnects.
      request.signal.addEventListener("abort", cleanup);
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
