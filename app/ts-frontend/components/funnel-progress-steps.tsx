import type { CSSProperties } from "react";

type FunnelProgressStepsProps = {
  steps: string[];
  currentStep: number;
  showNumbers: boolean;
  activeColor: string;
  activeBorderColor?: string;
};

type ProgressStepStyle = CSSProperties & {
  "--progress-step-border": string;
  "--progress-step-fill": string;
};

export function FunnelProgressSteps({
  steps,
  currentStep,
  showNumbers,
  activeColor,
  activeBorderColor = activeColor
}: FunnelProgressStepsProps) {
  if (steps.length === 0) return null;
  const selectedStep = Math.min(Math.max(currentStep, 1), steps.length);
  const minimumTrackWidth = steps.length > 4 ? steps.length * 112 : undefined;

  return (
    <div className="max-w-full overflow-x-auto pb-1">
      <ol
        className="progress-arrow-track grid text-center text-[13px] font-semibold tracking-normal sm:text-sm"
        aria-label="Progress"
        style={{
          gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
          minWidth: minimumTrackWidth
        }}
      >
        {steps.map((label, index) => {
          const active = index + 1 === selectedStep;
          const style: ProgressStepStyle = {
            "--progress-step-border": active ? activeBorderColor : "#b8bdc0",
            "--progress-step-fill": active ? activeColor : "#ffffff",
            zIndex: steps.length - index
          };
          return (
            <li
              key={`${index}-${label}`}
              aria-current={active ? "step" : undefined}
              className={`progress-arrow-step flex min-h-11 items-center justify-center py-2.5 pl-4 pr-7 ${active ? "text-white" : "text-[#596065]"}`}
              style={style}
            >
              <span className="line-clamp-2">
                {showNumbers ? `${index + 1} · ` : ""}{label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
