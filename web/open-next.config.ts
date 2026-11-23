import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Every page is pre-rendered at build time and nothing revalidates, so pages are read from the static assets.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
