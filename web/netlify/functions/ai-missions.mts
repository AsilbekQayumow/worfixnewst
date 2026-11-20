import { handleMissions } from "../../src/lib/ai/handlers";

/** GPS mission agent: OpenStreetMap lookups + Gemini. Called at /.netlify/functions/ai-missions. */
export default async (req: Request) => (req.method === "POST" ? handleMissions(req) : new Response("Method not allowed", { status: 405 }));
