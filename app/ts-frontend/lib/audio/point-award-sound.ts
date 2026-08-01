"use client";

const POINT_AWARD_SOUND_URL = "/sounds/point-add.mp3";

let audioContext: AudioContext | null = null;
let audioBufferPromise: Promise<AudioBuffer | null> | null = null;
let fallbackAudio: HTMLAudioElement | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  return audioContext;
}

export function preloadPointAwardSound() {
  if (typeof window === "undefined") return Promise.resolve(null);
  const context = getAudioContext();
  if (!context) {
    fallbackAudio ??= new Audio(POINT_AWARD_SOUND_URL);
    fallbackAudio.preload = "auto";
    return Promise.resolve(null);
  }
  audioBufferPromise ??= fetch(POINT_AWARD_SOUND_URL, { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("Point sound could not be loaded.");
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes))
    .catch(() => null);
  return audioBufferPromise;
}

export async function unlockPointAwardSound() {
  const context = getAudioContext();
  void preloadPointAwardSound();
  if (context?.state === "suspended") {
    await context.resume().catch(() => undefined);
  }
}

export async function playPointAwardSound() {
  const context = getAudioContext();
  if (!context) {
    fallbackAudio ??= new Audio(POINT_AWARD_SOUND_URL);
    fallbackAudio.preload = "auto";
    fallbackAudio.currentTime = 0;
    await fallbackAudio.play().catch(() => undefined);
    return;
  }
  await unlockPointAwardSound();
  const buffer = await preloadPointAwardSound();
  if (!buffer) return;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
}
