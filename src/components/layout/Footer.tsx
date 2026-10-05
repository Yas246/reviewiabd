"use client";

import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/version";

// ============================================
// FOOTER COMPONENT
// Technical metadata and version info
// ============================================

interface FooterProps {
  className?: string;
}


export function Footer({ className }: FooterProps) {
  return (
    <footer
      className={cn("mt-auto border-t border-paper-dark py-6", className)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-mono text-xs text-ink-muted flex items-center gap-4">
            <span>REVIEW_IABD_{APP_VERSION}</span>
            <span>::</span>
            <span>LABORATORY_AT_NIGHT_THEME</span>
          </div>

          <div className="font-mono text-xs text-ink-muted">
            Built by Yas246
          </div>
        </div>
      </div>
    </footer>
  );
}
