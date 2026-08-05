import { stopFeeder } from "@/lib/demo/feeder";

// Stop the live feeder (leaves the seeded history in place).
export async function POST() {
  return Response.json(stopFeeder());
}
