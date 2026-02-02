"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  BookOpen,
  FileText,
  Star,
  WifiOff,
  History,
  Settings,
  Home,
} from "lucide-react";
import { storageService } from "@/services/StorageService";

// ============================================
// NAVIGATION COMPONENT
// Desktop: Horizontal sticky navbar
// Mobile: Hamburger menu with slide-in panel
// ============================================

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresOnboarding?: boolean;
}

const navLinks: NavLink[] = [
  { href: "/", label: "Accueil", icon: Home },
  {
    href: "/practice",
    label: "Pratique",
    icon: BookOpen,
    requiresOnboarding: true,
  },
  { href: "/exam", label: "Examen", icon: FileText, requiresOnboarding: true },
  {
    href: "/favorites",
    label: "Favoris",
    icon: Star,
    requiresOnboarding: true,
  },
  {
    href: "/offline",
    label: "Hors Ligne",
    icon: WifiOff,
    requiresOnboarding: true,
  },
  {
    href: "/exams",
    label: "Historique",
    icon: History,
    requiresOnboarding: true,
  },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // Check if onboarding is completed
    const checkOnboarding = async () => {
      const completed = await storageService.isOnboardingCompleted();
      setOnboardingCompleted(completed);
    };
    checkOnboarding();
  }, []);

  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:block sticky top-0 z-50 bg-paper-primary/95 backdrop-blur-sm border-b border-paper-dark w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" prefetch={false} className="flex items-center">
              <span className="font-mono font-bold text-xl text-accent whitespace-nowrap">
                REVIEW_IABD
              </span>
            </Link>

            <div className="flex items-center gap-4 flex-1 justify-end">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                const isDisabled =
                  link.requiresOnboarding && !onboardingCompleted;

                if (isDisabled) {
                  return (
                    <div
                      key={link.href}
                      className={cn(
                        "px-4 py-2 rounded-md font-mono text-sm font-medium opacity-50 cursor-not-allowed flex items-center gap-2",
                        "text-ink-muted",
                      )}
                      title="Complétez l'onboarding d'abord"
                    >
                      <Icon className="w-4 h-4" />
                      <span>{link.label}</span>
                    </div>
                  );
                }

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    className={cn(
                      "px-3 py-2 rounded-md font-mono text-sm font-medium flex items-center gap-2 transition-colors relative whitespace-nowrap",
                      isActive
                        ? "text-accent bg-accent/10"
                        : "text-ink-secondary hover:text-accent hover:bg-paper-dark/50",
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <nav className="md:hidden sticky top-0 z-50 bg-paper-primary/95 backdrop-blur-sm border-b border-paper-dark w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" prefetch={false} className="flex items-center space-x-2">
              <span className="font-mono font-bold text-lg text-accent">
                REVIEW_IABD
              </span>
            </Link>

            <button
              onClick={toggleMenu}
              className="p-2 rounded-md text-ink-secondary hover:text-accent hover:bg-paper-secondary transition-colors"
              aria-label="Toggle menu"
            >
              {isOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu Panel */}
        <div
          className={cn(
            "md:hidden absolute top-16 left-0 right-0 bg-paper-secondary border-b border-paper-dark transform transition-transform duration-300 ease-in-out",
            isOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="px-4 py-4 space-y-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              const isDisabled =
                link.requiresOnboarding && !onboardingCompleted;

              if (isDisabled) {
                return (
                  <div
                    key={link.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md font-mono text-sm opacity-50 cursor-not-allowed",
                      "text-ink-muted",
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                  </div>
                );
              }

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={false}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md font-mono text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent border-l-2 border-accent"
                      : "text-ink-secondary hover:text-accent hover:bg-paper-dark",
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
