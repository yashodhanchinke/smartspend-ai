#!/usr/bin/env bash
set -euo pipefail

URL="${1:-}"
ENV_FILE=".env"

if [[ -z "$URL" ]]; then
  echo "Usage: bash scripts/set-expo-api-url.sh https://your-tunnel-url"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "${ENV_FILE} not found in current directory. Run from repo root."
  exit 1
fi

if grep -q '^EXPO_PUBLIC_API_URL=' "$ENV_FILE"; then
  sed -i "s|^EXPO_PUBLIC_API_URL=.*|EXPO_PUBLIC_API_URL=${URL}|" "$ENV_FILE"
else
  printf '\nEXPO_PUBLIC_API_URL=%s\n' "$URL" >> "$ENV_FILE"
fi

echo "Updated ${ENV_FILE}: EXPO_PUBLIC_API_URL=${URL}"
echo "Now restart Expo: npx expo start --dev-client -c"
