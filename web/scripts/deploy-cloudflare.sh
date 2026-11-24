#!/usr/bin/env bash
# Builds WORFIX for Cloudflare Workers and deploys it. Needs CLOUDFLARE_API_TOKEN (or `npx wrangler login`).
#   scripts/deploy-cloudflare.sh           build + deploy
#   scripts/deploy-cloudflare.sh --build   build only
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./cloudflare.env; set +a
export WORFIX_PRODUCTION=1 WORFIX_TARGET=cloudflare
# A webpack cache from a local (non-Cloudflare) build would bring back the Node build of Firestore, which
# Workers cannot run (runtime code generation): always start from a clean cache.
rm -rf .next/cache
npx opennextjs-cloudflare build
node scripts/embed-bracket-chunks.mjs
[ "${1:-}" = "--build" ] && exit 0
npx opennextjs-cloudflare deploy
