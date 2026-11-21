import { handleShopFulfil } from "../../src/lib/server/handlers";

/** Delivers a promo code for a paid order. /.netlify/functions/shop-fulfil */
export default async (req: Request) => (req.method === "POST" ? handleShopFulfil(req) : new Response("Method not allowed", { status: 405 }));
