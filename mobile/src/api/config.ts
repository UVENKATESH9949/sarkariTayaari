import Constants from "expo-constants";

const BACKEND_PORT = 8080;

function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:${BACKEND_PORT}/api`;
  }

  return "http://localhost:8080/api";
}

export const API_BASE_URL = resolveBaseUrl();
