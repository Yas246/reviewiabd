"use client";

import { cn } from "@/lib/utils";

// ============================================
// BATCH SIZE SLIDER COMPONENT
// Slider for configuring questions per API batch
// ============================================

interface BatchSizeSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  label?: string;
}

export function BatchSizeSlider({
  value,
  onChange,
  min = 5,
  max = 20,
  step = 1,
  className,
  label = "Questions par Batch (API)",
}: BatchSizeSliderProps) {
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
      <p className="text-xs text-ink-muted mt-3">
        Nombre de questions générées par appel API.
        <br />
        <span className="text-ink-secondary">•</span> Providers gratuits : 5-10 recommandé
        <br />
        <span className="text-ink-secondary">•</span> Providers payants : 10-20 possible
      </p>
    </div>
  );
}
