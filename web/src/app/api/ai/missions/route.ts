/** Local development route; production uses web/netlify/functions/ai-missions.mts. */
import { handleMissions } from "@/lib/ai/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function POST(req: Request) {
  return handleMissions(req);
}
