export async function backendFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("INTERNAL_API_SECRET is required for backend requests.");
  }
  if (secret) headers.set("x-treeschool-internal-secret", secret);
  return fetch(input, { ...init, headers });
}
