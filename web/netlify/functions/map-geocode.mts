import { handleGeocode } from "../../src/lib/map/server";

/** Place search (OpenRouteService). Called at /.netlify/functions/map-geocode?q=… */
export default async (req: Request) => (req.method === "GET" ? handleGeocode(req) : new Response("Method not allowed", { status: 405 }));
