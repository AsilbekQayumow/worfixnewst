#!/usr/bin/env bash
# Builds WORFIX for Cloudflare Workers and deploys it. Needs CLOUDFLARE_API_TOKEN (or `npx wrangler login`).
#   scripts/deploy-cloudflare.sh           build + deploy
#   scripts/deploy-cloudflare.sh --build   build only
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./cloudflare.env; set +a
export WORFIX_PRODUCTION=1 WORFIX_TARGET=cloudflare
npx opennextjs-cloudflare build
[ "${1:-}" = "--build" ] && exit 0
npx opennextjs-cloudflare deploy
