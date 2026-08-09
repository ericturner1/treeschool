"use client";

let audioContext: AudioContext | null = null;
let clapBuffer: AudioBuffer | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass();
  return audioContext;
}

function getClapBuffer(context: AudioContext) {
  if (clapBuffer) return clapBuffer;
  const frameCount = Math.round(context.sampleRate * 0.09);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
  }
  clapBuffer = buffer;
  return buffer;
}

function scheduleClap(context: AudioContext, at: number, volume: number, frequency: number) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = getClapBuffer(context);
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 0.65;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(at);
  source.stop(at + 0.1);
}

function scheduleFanfareNote(context: AudioContext, at: number, frequency: number, duration: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.12, at + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

export async function unlockWeekCompletionSound() {
  const context = getAudioContext();
  if (context?.state === "suspended") await context.resume().catch(() => undefined);
}

export async function playWeekCompletionSound() {
  const context = getAudioContext();
  if (!context) return;
  await unlockWeekCompletionSound();
  if (context.state !== "running") return;
  const start = context.currentTime + 0.02;
  [0, 0.075, 0.16, 0.27, 0.36, 0.47].forEach((offset, index) => {
    scheduleClap(context, start + offset, index < 2 ? 0.13 : 0.1, 1250 + (index % 3) * 260);
  });
  scheduleFanfareNote(context, start + 0.02, 523.25, 0.18);
  scheduleFanfareNote(context, start + 0.15, 659.25, 0.2);
  scheduleFanfareNote(context, start + 0.29, 783.99, 0.32);
  scheduleFanfareNote(context, start + 0.29, 1046.5, 0.32);
}
