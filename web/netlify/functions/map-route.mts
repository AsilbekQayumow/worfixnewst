import { handleRoute } from "../../src/lib/map/server";

/** Walking route (OpenRouteService). Called at /.netlify/functions/map-route. */
export default async (req: Request) => (req.method === "POST" ? handleRoute(req) : new Response("Method not allowed", { status: 405 }));
