"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Menu,
  X,
  FileText,
  Settings,
  Home,
  AlertCircle,
  Download,
  ScrollText,
  ChevronDown,
  Sun,
  Moon,
  BookOpen,
  NotebookPen,
  History,
  Star,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

// ============================================
// NAVIGATION COMPONENT
// Desktop: navbar épurée (4 modes principaux +
// menu « Plus » + icône Paramètres à droite)
// Mobile: hamburger avec liste complète
// ============================================

interface NavLink {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const primaryLinks: NavLink[] = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/practice", label: "Pratique", icon: BookOpen },
  { href: "/exam", label: "Examen", icon: FileText },
  { href: "/mock-exams", label: "Épreuves réelles", icon: ScrollText },
];

const secondaryLinks: NavLink[] = [
  { href: "/banque", label: "Lire les questions", icon: BookOpen },
  { href: "/cheatsheets", label: "Cheat Sheets", icon: NotebookPen },
  { href: "/mistakes", label: "Erreurs", icon: AlertCircle },
  { href: "/favorites", label: "Favoris", icon: Star },
  { href: "/import", label: "Importer", icon: Download },
  { href: "/exams", label: "Historique", icon: History },
];

const mobileLinks: NavLink[] = [
  ...primaryLinks,
  ...secondaryLinks,
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export function Navigation() {
  const [isOpen, setIsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Ferme le menu « Plus » au clic extérieur ou au changement de page
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [moreOpen]);

  const toggleMenu = () => setIsOpen(!isOpen);

  const isSectionActive = (links: NavLink[]) =>
    links.some((l) => l.href === pathname);

  const renderLink = (link: NavLink, onClick?: () => void) => {
    const Icon = link.icon;
    const isActive = pathname === link.href;
    return (
      <Link
        key={link.href}
        href={link.href}
        prefetch={false}
        onClick={onClick}
        className={cn(
          "px-3 py-2 rounded-md font-mono text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap",
          isActive
            ? "text-accent bg-accent/10"
            : "text-ink-secondary hover:text-accent hover:bg-paper-dark/50",
        )}
      >
        <Icon className="w-4 h-4" />
        <span>{link.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Desktop Navigation : pilule flottante en verre */}
      <nav className="hidden md:block sticky top-4 z-50 px-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between h-14 px-5 rounded-full bg-paper-secondary/75 backdrop-blur-xl border border-paper-dark shadow-[0_10px_40px_-16px_rgba(0,0,0,0.4)]">
            <Link href="/" prefetch={false} className="flex items-center">
              <span className="font-mono font-bold text-base text-accent whitespace-nowrap">
                REVIEW_IABD
              </span>
            </Link>

            <div className="flex items-center gap-1.5 flex-1 justify-end">
              {primaryLinks.map((l) => renderLink(l))}

              {/* Menu « Plus » : outils secondaires */}
              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen(!moreOpen)}
                  data-tour="nav-plus"
                  className={cn(
                    "px-3 py-2 rounded-md font-mono text-sm font-medium flex items-center gap-1.5 transition-colors",
                    isSectionActive(secondaryLinks) || moreOpen
                      ? "text-accent bg-accent/10"
                      : "text-ink-secondary hover:text-accent hover:bg-paper-dark/50",
                  )}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  Plus
                  <ChevronDown
                    className={cn("w-4 h-4 transition-transform", moreOpen && "rotate-180")}
                  />
                </button>

                {moreOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-52 bg-paper-secondary border border-paper-dark rounded-lg shadow-xl overflow-hidden z-50"
                    role="menu"
                  >
                    {secondaryLinks.map((l) => {
                      const Icon = l.icon;
                      const isActive = pathname === l.href;
                      return (
                        <Link
                          key={l.href}
                          href={l.href}
                          prefetch={false}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 font-mono text-sm transition-colors",
                            isActive
                              ? "text-accent bg-accent/10"
                              : "text-ink-secondary hover:text-accent hover:bg-paper-dark/50",
                          )}
                          role="menuitem"
                        >
                          <Icon className="w-4 h-4" />
                          <span>{l.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Thème + Paramètres : à droite */}
              <ThemeToggle />
              <Link
                href="/settings"
                prefetch={false}
                className={cn(
                  "inline-flex items-center justify-center w-9 h-9 rounded-full border border-paper-dark bg-paper-secondary text-ink-secondary hover:text-accent hover:border-accent/50 transition-all duration-300",
                  pathname === "/settings"
                    ? "text-accent border-accent/50 bg-accent/10"
                    : "",
                )}
                aria-label="Paramètres"
                title="Paramètres"
              >
                <Settings className="w-4 h-4" />
              </Link>
            </div>
        </div>
      </nav>

      {/* Mobile Navigation */}
      <nav className="md:hidden sticky top-0 z-50 bg-paper-secondary/85 backdrop-blur-xl border-b border-paper-dark w-full">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link href="/" prefetch={false} className="flex items-center space-x-2">
              <span className="font-mono font-bold text-lg text-accent">
                REVIEW_IABD
              </span>
            </Link>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                onClick={toggleMenu}
                className="p-2 rounded-md text-ink-secondary hover:text-accent hover:bg-paper-secondary transition-colors"
                aria-label="Toggle menu"
              >
                {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
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
            <div className="px-4 py-4 space-y-1">
              {mobileLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={false}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-md font-mono text-sm font-medium transition-colors",
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
        </div>
      </nav>
    </>
  );
}
