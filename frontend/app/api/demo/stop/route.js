import { stopFeeder } from "@/lib/demo/feeder";
import { sameOriginOk } from "@/lib/http/sameOrigin";

// Stop the live feeder (leaves the seeded history in place).
export async function POST(request) {
  if (!sameOriginOk(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  return Response.json(stopFeeder());
}
