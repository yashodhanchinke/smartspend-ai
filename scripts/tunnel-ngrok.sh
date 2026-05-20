#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok is not installed."
  echo "Install: https://ngrok.com/download"
  exit 1
fi

echo "Starting ngrok tunnel to http://localhost:${PORT}"
echo "Keep this terminal open. Copy the Forwarding https:// URL from below."
echo

ngrok http "${PORT}"
