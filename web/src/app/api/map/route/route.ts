/** Local development route; production uses web/netlify/functions/map-route.mts. */
import { handleRoute } from "@/lib/map/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleRoute(req);
}
