/**
 * The server functions, by name. The browser calls them at /.netlify/functions/<name> (that path is kept so
 * the app works unchanged on Netlify and on Cloudflare): Netlify runs web/netlify/functions/*.mts,
 * Cloudflare routes the same path in web/worker.ts to the same handlers.
 */
import { handleMissions, handleVerify } from "../ai/handlers";
import { handleGeocode, handleRoute } from "../map/server";
import { handleAiReview, handleShopFulfil } from "./handlers";
import { handlePushRegister, handlePushSend, handlePushUnregister } from "./push";
import { handleWidget, handleWidgetToken } from "./widget";
import { handleEmergencyBroadcast } from "./v6";

export const FUNCTIONS: Record<string, { method: "GET" | "POST"; run: (req: Request) => Promise<Response> }> = {
  "ai-missions": { method: "POST", run: handleMissions },
  "ai-verify": { method: "POST", run: handleVerify },
  "ai-review": { method: "POST", run: handleAiReview },
  "shop-fulfil": { method: "POST", run: handleShopFulfil },
  "map-route": { method: "POST", run: handleRoute },
  "map-geocode": { method: "GET", run: handleGeocode },
  // v5: the WORFIX app (Android/iOS)
  "push-register": { method: "POST", run: handlePushRegister },
  "push-unregister": { method: "POST", run: handlePushUnregister },
  "push-send": { method: "POST", run: handlePushSend },
  "widget-token": { method: "POST", run: handleWidgetToken },
  "widget": { method: "GET", run: handleWidget },
  // v6: the emergency notice to everyone in the area (feature 19)
  "emergency-broadcast": { method: "POST", run: handleEmergencyBroadcast },
};
