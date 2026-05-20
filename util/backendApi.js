import Constants from "expo-constants";
import { Platform } from "react-native";

export function getApiBaseCandidates() {
  const candidates = [];
  const configured = process.env.EXPO_PUBLIC_API_URL;

  if (configured) {
    candidates.push(configured.replace(/\/+$/, ""));
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoConfig?.debuggerHost ||
    Constants.manifest2?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.hostUri;

  if (typeof hostUri === "string" && hostUri.length) {
    const host = hostUri.split(":")[0];
    candidates.push(`http://${host}:3000`);
  }

  if (Platform.OS === "android") {
    candidates.push("http://10.0.2.2:3000");
  }

  candidates.push("http://localhost:3000");

  return Array.from(new Set(candidates.filter(Boolean)));
}

async function fetchWithTimeout(url, init, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function callBackendApi(path, { accessToken, body, method = "POST" } = {}) {
  const candidates = getApiBaseCandidates();
  const attemptedUrls = [];
  let lastError = null;

  for (const base of candidates) {
    const url = `${base}${path}`;
    attemptedUrls.push(url);

    try {
      const response = await fetchWithTimeout(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      return { response, base };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not reach backend API. Tried: ${attemptedUrls.join(", ")}. ${lastError?.message || ""}`.trim()
  );
}
