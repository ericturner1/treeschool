const PRODUCTION_APP_ORIGIN = "https://www.treehomeschool.com";

function httpOrigin(value: string | URL | undefined) {
  if (!value) return null;
  try {
    const url = value instanceof URL ? value : new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function resolvePublicAppOrigin(input: {
  configuredUrl?: string;
  nodeEnv?: string;
  requestUrl?: string | URL;
}) {
  const configured = httpOrigin(input.configuredUrl);
  if (configured) return configured;
  if (input.nodeEnv === "production") return PRODUCTION_APP_ORIGIN;
  return httpOrigin(input.requestUrl) ?? "http://localhost:3100";
}

export function getPublicAppOrigin(requestUrl?: string | URL) {
  return resolvePublicAppOrigin({
    configuredUrl: process.env.NEXT_PUBLIC_APP_URL,
    nodeEnv: process.env.NODE_ENV,
    requestUrl
  });
}
