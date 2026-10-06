import { startFeeder } from "@/lib/demo/feeder";
import { sameOriginOk } from "@/lib/http/sameOrigin";

export async function POST(request) {
  if (!sameOriginOk(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }
  try {
    return Response.json(await startFeeder());
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
