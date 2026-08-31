import {
  getCurrentUser,
  getUserForAccessToken,
  type AuthUser,
} from "./server";

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function getRequestUser(request: Request): Promise<AuthUser | null> {
  const accessToken = getBearerToken(request);
  return accessToken
    ? getUserForAccessToken(accessToken)
    : getCurrentUser();
}
