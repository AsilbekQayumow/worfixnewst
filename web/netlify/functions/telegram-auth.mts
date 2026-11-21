import { handleTelegramAuth } from "../../src/lib/server/handlers";

/** Telegram Login Widget → Firebase custom token. /.netlify/functions/telegram-auth */
export default async (req: Request) => (req.method === "POST" ? handleTelegramAuth(req) : new Response("Method not allowed", { status: 405 }));
