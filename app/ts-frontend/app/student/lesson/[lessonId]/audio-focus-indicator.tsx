"use client";

type AudioFocusIndicatorProps = {
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
  animationKey: string | number;
};

export function AudioFocusIndicator({ rect, animationKey }: AudioFocusIndicatorProps) {
  if (!rect) {
    return null;
  }

  return (
    <div
      key={animationKey}
      aria-hidden="true"
      className="lesson-audio-focus-indicator"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
      }}
    />
  );
}
