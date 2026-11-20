/** Local development route; production uses web/netlify/functions/map-geocode.mts. */
import { handleGeocode } from "@/lib/map/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return handleGeocode(req);
}
