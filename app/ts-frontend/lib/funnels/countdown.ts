import type { FunnelCountdownDuration } from "./page-document";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function wholeNumber(value: number, maximum?: number) {
  const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  return maximum === undefined ? normalized : Math.min(maximum, normalized);
}

export function countdownDurationMs(duration: FunnelCountdownDuration) {
  return wholeNumber(duration.days) * DAY_MS
    + wholeNumber(duration.hours, 23) * HOUR_MS
    + wholeNumber(duration.minutes, 59) * MINUTE_MS
    + wholeNumber(duration.seconds, 59) * SECOND_MS;
}

export function countdownParts(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / SECOND_MS));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60
  };
}

export function countdownStorageKey(scope: string, elementId: string, durationMs: number) {
  return `treeschool:funnel-countdown:${scope}:${elementId}:${durationMs}`;
}

export function safeCountdownRedirectTarget(target: string, origin: string) {
  const trimmed = target.trim();
  if (!trimmed || trimmed.startsWith("//")) return null;
  try {
    const destination = new URL(trimmed, origin);
    if (destination.protocol !== "http:" && destination.protocol !== "https:") return null;
    if (trimmed.startsWith("/")) {
      return `${destination.pathname}${destination.search}${destination.hash}`;
    }
    return destination.href;
  } catch {
    return null;
  }
}
