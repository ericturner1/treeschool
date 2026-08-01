import { NextResponse } from "next/server";
import {
  FUNNEL_ATTRIBUTION_COOKIE,
  parseFunnelAttribution
} from "../../../../lib/funnels/attribution";

function safeDestination(request: Request, rawTarget: string | null) {
  const requestUrl = new URL(request.url);
  const forwardedHost =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const publicOrigin = forwardedHost
    ? `${forwardedProtocol}://${forwardedHost}`
    : requestUrl.origin;

  if (!rawTarget) return new URL("/", publicOrigin);
  if (rawTarget.startsWith("/") && !rawTarget.startsWith("//")) {
    return new URL(rawTarget, publicOrigin);
  }
  try {
    const destination = new URL(rawTarget);
    const allowed =
      destination.origin === publicOrigin ||
      destination.hostname === "treehomeschool.com" ||
      destination.hostname.endsWith(".treehomeschool.com") ||
      destination.hostname === "buy.stripe.com" ||
      destination.hostname === "checkout.stripe.com";
    return allowed ? destination : new URL("/", publicOrigin);
  } catch {
    return new URL("/", publicOrigin);
  }
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const attribution = parseFunnelAttribution(url.searchParams.get("attribution"));
  const response = NextResponse.redirect(safeDestination(request, url.searchParams.get("target")));
  if (attribution) {
    response.cookies.set(FUNNEL_ATTRIBUTION_COOKIE, JSON.stringify(attribution), {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      sameSite: "lax",
      secure: url.protocol === "https:"
    });
  }
  return response;
}
