#!/usr/bin/env bash
# Deploy web + Pages Functions to Cloudflare.
# Requires: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (see DEPLOY.md)
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: Set CLOUDFLARE_API_TOKEN (Cloudflare API token with Pages edit access)." >&2
  exit 1
fi
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-513c82ca37c8d7e83926801120de3eee}"

npm ci --workspace web
npm run build -w web
cd web
npx wrangler pages deploy dist --project-name=wilhite-portfolio --commit-dirty=true
echo "Deployed: https://wilhite-portfolio.pages.dev"
