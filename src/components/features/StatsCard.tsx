"use client";

import { cn } from "@/lib/utils";

// ============================================
// STATS CARD COMPONENT
// Display metrics with monospace numbers
// ============================================

interface StatsCardProps {
  label: string;
  value: number | string;
  unit?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  color?: string;
}

export function StatsCard({
  label,
  value,
  unit,
  icon,
  trend,
  className,
  color,
}: StatsCardProps) {
  return (
    <div className={cn("card", className)}>
      <div className="flex items-start justify-between mb-2">
        <div className="font-mono text-xs text-ink-muted uppercase">
          {label}
        </div>
        {icon && <div className="text-accent">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-4xl font-bold font-mono"
          style={{ color: color || "var(--ink-primary)" }}
        >
          {value}
        </span>
        {unit && (
          <span className="font-mono text-sm text-ink-muted">{unit}</span>
        )}
      </div>
      {trend && (
        <div
          className={cn(
            "flex items-center gap-1 mt-2 font-mono text-xs",
            trend.isPositive ? "text-domain-dl" : "text-domain-ml"
          )}
        >
          <span>{trend.isPositive ? "↑" : "↓"}</span>
          <span>{Math.abs(trend.value)}%</span>
        </div>
      )}
    </div>
  );
}

interface StatsGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}

export function StatsGrid({
  children,
  columns = 4,
  className,
}: StatsGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}
