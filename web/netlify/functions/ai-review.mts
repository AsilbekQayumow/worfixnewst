import { handleAiReview } from "../../src/lib/server/handlers";

/** AI review of an agent-mission submission; writes the decision with the Admin SDK. /.netlify/functions/ai-review */
export default async (req: Request) => (req.method === "POST" ? handleAiReview(req) : new Response("Method not allowed", { status: 405 }));
