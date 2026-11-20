import { handleVerify } from "../../src/lib/ai/handlers";

/** Evidence photo check with Gemini. Called at /.netlify/functions/ai-verify. */
export default async (req: Request) => (req.method === "POST" ? handleVerify(req) : new Response("Method not allowed", { status: 405 }));
