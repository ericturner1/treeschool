"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FunnelPageElement } from "../lib/funnels/page-document";
import {
  countdownDurationMs,
  countdownParts,
  countdownStorageKey,
  safeCountdownRedirectTarget
} from "../lib/funnels/countdown";

type CountdownElement = Extract<FunnelPageElement, { type: "countdown" }>;

function typographyStyle(
  typography: CountdownElement["props"]["typography"] | CountdownElement["props"]["labelTypography"],
  fallbackColor: string
): CSSProperties {
  return {
    color: typography?.color ?? fallbackColor,
    fontFamily: typography?.fontFamily || undefined,
    fontSize: typography?.fontSize,
    fontWeight: typography?.fontWeight
  };
}

export function FunnelCountdown({
  element,
  storageScope,
  fallbackTimeColor,
  fallbackLabelColor
}: {
  element: CountdownElement;
  storageScope: string;
  fallbackTimeColor: string;
  fallbackLabelColor: string;
}) {
  const configuredDurationMs = useMemo(() => countdownDurationMs(element.props.duration), [element.props.duration]);
  const [remainingMs, setRemainingMs] = useState(() => {
    if (element.props.mode === "deadline") {
      const deadline = Date.parse(element.props.deadline ?? "");
      return Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : 0;
    }
    return configuredDurationMs;
  });
  const [expired, setExpired] = useState(false);
  const expiryHandled = useRef(false);

  useEffect(() => {
    expiryHandled.current = false;
    setExpired(false);

    let endAt: number;
    if (element.props.mode === "deadline") {
      endAt = Date.parse(element.props.deadline ?? "");
      if (!Number.isFinite(endAt)) endAt = Date.now();
    } else {
      const key = countdownStorageKey(storageScope, element.id, configuredDurationMs);
      const stored = Number(window.localStorage.getItem(key));
      endAt = Number.isFinite(stored) && stored > 0 ? stored : Date.now() + configuredDurationMs;
      if (!(Number.isFinite(stored) && stored > 0)) {
        window.localStorage.setItem(key, String(endAt));
      }
    }

    const update = () => {
      const next = Math.max(0, endAt - Date.now());
      setRemainingMs(next);
      if (next === 0) setExpired(true);
    };

    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [configuredDurationMs, element.id, element.props.deadline, element.props.mode, storageScope]);

  useEffect(() => {
    if (!expired || expiryHandled.current) return;
    expiryHandled.current = true;
    if (element.props.expiryAction.type !== "redirect") return;
    const destination = safeCountdownRedirectTarget(element.props.expiryAction.target, window.location.origin);
    if (destination) window.location.assign(destination);
  }, [element.props.expiryAction, expired]);

  if (expired && element.props.expiryAction.type === "hide") return null;
  if (expired && element.props.expiryAction.type === "message") {
    return (
      <p className={`font-semibold ${element.props.align === "center" ? "text-center" : element.props.align === "right" ? "text-right" : "text-left"}`}>
        {element.props.expiryAction.message}
      </p>
    );
  }

  const parts = countdownParts(remainingMs);
  const units = [
    ...(element.props.showDays ? [{ label: "Days", value: parts.days }] : []),
    { label: "Hours", value: parts.hours },
    { label: "Minutes", value: parts.minutes },
    { label: "Seconds", value: parts.seconds }
  ];
  const justification = element.props.align === "center" ? "justify-center" : element.props.align === "right" ? "justify-end" : "justify-start";

  return (
    <div className={`flex ${justification}`} role="timer" aria-label={`${parts.days} days, ${parts.hours} hours, ${parts.minutes} minutes, ${parts.seconds} seconds remaining`}>
      <div className="inline-flex items-start gap-2 sm:gap-3">
        {units.map((unit, index) => (
          <div key={unit.label} className="contents">
            {index > 0 ? (
              <span className="pt-0.5 leading-none" style={typographyStyle(element.props.typography, fallbackTimeColor)} aria-hidden="true">
                {element.props.separator}
              </span>
            ) : null}
            <span className="grid min-w-[2.2ch] justify-items-center leading-none">
              <span className="tabular-nums" style={typographyStyle(element.props.typography, fallbackTimeColor)}>{String(unit.value).padStart(2, "0")}</span>
              {element.props.showLabels ? <span className="mt-2 uppercase tracking-[0.08em]" style={typographyStyle(element.props.labelTypography, fallbackLabelColor)}>{unit.label}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
