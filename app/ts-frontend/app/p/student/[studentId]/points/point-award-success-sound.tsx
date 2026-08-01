"use client";

import { useEffect } from "react";
import {
  playPointAwardSound,
  preloadPointAwardSound
} from "../../../../../lib/audio/point-award-sound";

let lastPlayedKey: string | null = null;

export function PointAwardSuccessSound({ playKey }: { playKey: string | null }) {
  useEffect(() => {
    void preloadPointAwardSound();
    if (!playKey || playKey === lastPlayedKey) return;
    const storageKey = "treeschool:last-point-award-sound";
    if (window.sessionStorage.getItem(storageKey) === playKey) return;
    lastPlayedKey = playKey;
    window.sessionStorage.setItem(storageKey, playKey);
    void playPointAwardSound();
  }, [playKey]);

  return null;
}
