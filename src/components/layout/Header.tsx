"use client";

import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/utils";

// ============================================
// HEADER COMPONENT
// Lab notebook date/version display
// ============================================

interface HeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
  showVersion?: boolean;
}

const APP_VERSION = "v2.0.4";

export function Header({ title, subtitle, className, showVersion = true }: HeaderProps) {
  const currentDate = new Date();

  return (
    <header className={cn("border-b border-paper-dark pb-6 mb-8", className)}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-8 bg-accent" />
            <h1 className="font-mono font-bold text-2xl sm:text-3xl">{title}</h1>
          </div>
          {subtitle && (
            <p className="text-ink-secondary ml-5">{subtitle}</p>
          )}
        </div>

        {showVersion && (
          <div className="font-mono text-xs text-ink-muted">
            <div className="corner-decoration px-3 py-2">
              <div className="flex flex-col gap-1">
                <span>REVIEW_IABD_{APP_VERSION}</span>
                <span>{formatShortDate(currentDate)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 bg-accent" />
          <div>
            <h2 className="font-mono font-semibold text-xl">{title}</h2>
            {description && (
              <p className="text-ink-secondary text-sm mt-1">{description}</p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
