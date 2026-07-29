export function safeAuthRenewalReturnPath(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/p/dashboard";
}

export function authRenewalPathFor(url: URL) {
  const returnPath = `${url.pathname}${url.search}`;
  return `/auth/renew?next=${encodeURIComponent(returnPath)}`;
}
