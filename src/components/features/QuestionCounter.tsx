"use client";

import { cn } from "@/lib/utils";

// ============================================
// QUESTION COUNTER COMPONENT
// Input for number of questions (5-50)
// ============================================

interface QuestionCounterProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  label?: string;
}

export function QuestionCounter({
  value,
  onChange,
  min = 5,
  max = 50,
  step = 5,
  className,
  label = "Nombre de questions",
}: QuestionCounterProps) {
  const options = [];
  for (let i = min; i <= max; i += step) {
    options.push(i);
  }

  return (
    <div className={cn("", className)}>
      <label className="font-mono text-xs text-ink-muted uppercase mb-2 block">
        {label}
      </label>
      <div className="flex items-center gap-4">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="flex-1 h-2 bg-paper-secondary rounded-lg appearance-none cursor-pointer accent-accent"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(Math.max(min, value - step))}
            disabled={value <= min}
            className="w-8 h-8 rounded border border-paper-dark font-mono text-sm text-ink-secondary hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            -
          </button>
          <span className="font-mono font-bold text-lg w-16 text-center">
            {value}
          </span>
          <button
            onClick={() => onChange(Math.min(max, value + step))}
            disabled={value >= max}
            className="w-8 h-8 rounded border border-paper-dark font-mono text-sm text-ink-secondary hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex justify-between mt-2">
        <span className="font-mono text-xs text-ink-muted">{min}</span>
        <span className="font-mono text-xs text-ink-muted">{max}</span>
      </div>
    </div>
  );
}

interface QuickCountButtonsProps {
  onChange: (value: number) => void;
  options?: number[];
  className?: string;
}

export function QuickCountButtons({
  onChange,
  options = [10, 20, 30, 40, 50],
  className,
}: QuickCountButtonsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2 mt-3", className)}>
      {options.map((count) => (
        <button
          key={count}
          onClick={() => onChange(count)}
          className="px-3 py-1 rounded border border-paper-dark font-mono text-xs text-ink-secondary hover:border-accent hover:text-accent transition-colors"
        >
          {count}
        </button>
      ))}
    </div>
  );
}
