import { cn } from "@/lib/utils";

// ============================================
// PROGRESS BAR COMPONENT
// Technical/industrial progress indicator
// ============================================

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  className?: string;
  showLabel?: boolean;
  label?: string;
  color?: string;
  animated?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  className,
  showLabel = false,
  label,
  color,
  animated = true,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn("w-full", className)}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-2">
          {label && (
            <span className="font-mono text-xs text-ink-muted uppercase">
              {label}
            </span>
          )}
          {showLabel && (
            <span className="font-mono text-xs text-ink-muted">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div className="progress-container">
        <div
          className="progress-bar"
          style={{
            width: `${percentage}%`,
            backgroundColor: color || undefined,
            transition: animated ? "width 0.5s ease" : "none",
          }}
        />
      </div>
    </div>
  );
}

interface ProgressStepsProps {
  steps: Array<{ label: string; completed: boolean; current?: boolean }>;
  className?: string;
}

export function ProgressSteps({ steps, className }: ProgressStepsProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      {steps.map((step, index) => (
        <div key={index} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-mono text-sm font-bold border-2 transition-colors",
                step.completed
                  ? "bg-accent border-accent text-paper-primary"
                  : step.current
                  ? "border-accent text-accent"
                  : "border-paper-dark text-ink-muted"
              )}
            >
              {step.completed ? "✓" : index + 1}
            </div>
            <span className="font-mono text-xs mt-2 text-ink-muted uppercase">
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div
              className={cn(
                "h-0.5 flex-1 mx-2",
                step.completed ? "bg-accent" : "bg-paper-dark"
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}
