#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

echo "Starting Cloudflare quick tunnel to http://localhost:${PORT}"
echo "Keep this terminal open. Copy the https://*.trycloudflare.com URL from below."
echo

cloudflared tunnel --url "http://localhost:${PORT}" --no-autoupdate
