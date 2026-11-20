/**
 * Runs before `next build`. On a Netlify production deploy the Firebase values must be set: without them
 * the site would start in local demo mode, and real users would see an empty demo instead of their accounts.
 * Set ALLOW_DEMO=1 to deploy the demo on purpose.
 */
import nextEnv from "@next/env";

// Read .env files the same way `next build` will.
nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

const need = ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_APP_ID"];
const missing = need.filter((k) => !process.env[k]);
const production = process.env.NETLIFY === "true" && process.env.CONTEXT === "production";
const warn = [];
if (!process.env.GEMINI_API_KEY) warn.push("GEMINI_API_KEY (GPS agent and photo check will be unavailable)");
if (!process.env.ORS_API_KEY) warn.push("ORS_API_KEY (routes and place search fall back to public services)");
if (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET === "storageBucket") warn.push("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET holds a placeholder value");

if (missing.length && production && process.env.ALLOW_DEMO !== "1") {
  console.error(`\n✖ WORFIX: missing ${missing.join(", ")}.\n  Without them the live site would open in demo mode and users would not see their accounts.\n  Add them in Netlify → Site configuration → Environment variables (see DEPLOY.md), or set ALLOW_DEMO=1.\n`);
  process.exit(1);
}
if (missing.length) console.warn(`⚠ WORFIX: Firebase is not configured (${missing.join(", ")}): building in LOCAL DEMO MODE.`);
else console.log(`✓ WORFIX: Firebase project "${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}".`);
for (const w of warn) console.warn(`⚠ WORFIX: ${w}`);
