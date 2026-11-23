// Cloudflare's static-asset server redirects in a loop for file names with "[id]" or "(group)"
// (browsers ask for them percent-encoded). Those few small files are embedded in the Worker instead
// and answered directly. Run after `opennextjs-cloudflare build`, before deploy.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = ".open-next/assets";
const out = {};
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const url = "/" + relative(root, p).split(sep).join("/");
    if (/[\[\]()]/.test(url) && url.startsWith("/_next/static/") && /\.(js|css)$/.test(url)) out[url] = readFileSync(p, "utf8");
  }
})(root);
writeFileSync(".open-next/bracket-chunks.json", JSON.stringify(out));
console.log(`embedded ${Object.keys(out).length} bracket/group chunks`);
