import { cn } from "@/lib/utils";
import { ReactNode } from "react";

// ============================================
// BADGE COMPONENT
// Technical labels with monospace styling
// ============================================

interface BadgeProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "accent" | "success" | "warning";
}

export function Badge({ children, className, variant = "default" }: BadgeProps) {
  return (
    <span
      className={cn(
        "badge",
        variant === "accent" && "border-accent text-accent",
        variant === "success" && "border-domain-dl text-domain-dl",
        variant === "warning" && "border-domain-ml text-domain-ml",
        className
      )}
    >
      {children}
    </span>
  );
}

interface BadgeGroupProps {
  children: ReactNode;
  className?: string;
}

export function BadgeGroup({ children, className }: BadgeGroupProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {children}
    </div>
  );
}
