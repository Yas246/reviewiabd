"use client";

import { Domain, DOMAIN_LABELS } from "@/types";
import { getDomainColor, getDomainShortLabel } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ============================================
// DOMAIN SELECTOR COMPONENT
// Dropdown or grid selection for IABD domains
// ============================================

interface DomainSelectorProps {
  value: Domain;
  onChange: (domain: Domain) => void;
  className?: string;
  variant?: "dropdown" | "grid";
  excludeDomains?: Domain[];
}

export function DomainSelector({
  value,
  onChange,
  className,
  variant = "dropdown",
  excludeDomains = [],
}: DomainSelectorProps) {
  const domains = Object.values(Domain).filter((d) => !excludeDomains.includes(d));

  if (variant === "grid") {
    return (
      <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3", className)}>
        {domains.map((domain) => {
          const isSelected = value === domain;
          const color = getDomainColor(domain);
          const shortLabel = getDomainShortLabel(domain);

          return (
            <button
              key={domain}
              onClick={() => onChange(domain)}
              className={cn(
                "card p-4 text-center transition-all",
                isSelected && "ring-2 ring-accent"
              )}
              style={{
                borderColor: isSelected ? color : undefined,
              }}
            >
              <div
                className="w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center font-mono font-bold text-sm"
                style={{
                  backgroundColor: color,
                  color: "var(--paper-primary)",
                }}
              >
                {shortLabel}
              </div>
              <span className="font-mono text-xs uppercase text-ink-secondary">
                {DOMAIN_LABELS[domain].split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("", className)}>
      <label className="font-mono text-xs text-ink-muted uppercase mb-2 block">
        Domaine
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Domain)}
        className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary focus:outline-none focus:border-accent"
      >
        {domains.map((domain) => (
          <option key={domain} value={domain}>
            {DOMAIN_LABELS[domain]}
          </option>
        ))}
      </select>
    </div>
  );
}

interface DomainBadgeProps {
  domain: Domain;
  className?: string;
}

export function DomainBadge({ domain, className }: DomainBadgeProps) {
  const color = getDomainColor(domain);
  const shortLabel = getDomainShortLabel(domain);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1 rounded font-mono text-xs uppercase border",
        className
      )}
      style={{
        borderColor: color,
        color,
      }}
    >
      <span
        className="w-2 h-2 rounded-full"
        style={{
          backgroundColor: color,
        }}
      />
      {shortLabel}
    </span>
  );
}
