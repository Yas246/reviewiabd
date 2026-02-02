"use client";

import { useState, useEffect } from "react";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Clock, Pause, Play } from "lucide-react";

// ============================================
// QUIZ TIMER COMPONENT
// Adaptive timer display for exam mode
// ============================================

interface QuizTimerProps {
  initialTime: number; // in seconds
  timeLimit?: number; // in seconds
  onTimeUp?: () => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  className?: string;
  showControls?: boolean;
  mode?: "countdown" | "countup";
}

export function QuizTimer({
  initialTime,
  timeLimit,
  onTimeUp,
  isPaused = false,
  onTogglePause,
  className,
  showControls = true,
  mode = "countup",
}: QuizTimerProps) {
  const [time, setTime] = useState(initialTime);

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setTime((prevTime) => {
        const newTime = mode === "countdown" ? prevTime - 1 : prevTime + 1;

        // Check if time is up (for countdown mode)
        if (mode === "countdown" && newTime <= 0) {
          onTimeUp?.();
          return 0;
        }

        // Check if time limit exceeded (for countup mode)
        if (mode === "countup" && timeLimit && newTime >= timeLimit) {
          onTimeUp?.();
        }

        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, mode, timeLimit, onTimeUp]);

  const remainingPercentage = timeLimit
    ? (time / timeLimit) * 100
    : 100;

  const isWarning = mode === "countdown" && remainingPercentage <= 20;
  const isDanger = mode === "countdown" && remainingPercentage <= 10;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded border",
        isDanger
          ? "border-domain-ml bg-domain-ml/10"
          : isWarning
          ? "border-domain-ai bg-domain-ai/10"
          : "border-paper-dark bg-paper-secondary",
        className
      )}
    >
      <Clock
        className={cn(
          "w-5 h-5",
          isDanger && "text-domain-ml animate-pulse",
          isWarning && "text-domain-ai",
          !isWarning && !isDanger && "text-ink-muted"
        )}
      />
      <span
        className={cn(
          "font-mono font-bold text-lg",
          isDanger && "text-domain-ml",
          isWarning && "text-domain-ai"
        )}
      >
        {formatTime(time)}
      </span>
      {timeLimit && (
        <span className="font-mono text-xs text-ink-muted">
          / {formatTime(timeLimit)}
        </span>
      )}
      {showControls && onTogglePause && (
        <button
          onClick={onTogglePause}
          className="ml-2 p-1 rounded hover:bg-paper-dark transition-colors"
          aria-label={isPaused ? "Reprendre" : "Pause"}
        >
          {isPaused ? (
            <Play className="w-4 h-4 text-ink-muted" />
          ) : (
            <Pause className="w-4 h-4 text-ink-muted" />
          )}
        </button>
      )}
    </div>
  );
}

interface SimpleTimerProps {
  seconds: number;
  className?: string;
}

export function SimpleTimer({ seconds, className }: SimpleTimerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 font-mono text-sm text-ink-muted",
        className
      )}
    >
      <Clock className="w-4 h-4" />
      <span>{formatTime(seconds)}</span>
    </div>
  );
}
