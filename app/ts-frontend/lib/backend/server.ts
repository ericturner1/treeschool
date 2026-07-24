export async function backendFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  const secret = process.env.INTERNAL_API_SECRET;
  if (secret) headers.set("x-treeschool-internal-secret", secret);
  return fetch(input, { ...init, headers });
}
