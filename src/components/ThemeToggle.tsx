"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// ============================================
// THEME TOGGLE
// Bascule clair / sombre, mémorisée dans
// localStorage, appliquée via data-theme.
// ============================================

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light"
    );
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  };

  if (!mounted) {
    return (
      <span className="inline-flex w-9 h-9 rounded-full border border-paper-dark bg-paper-secondary" />
    );
  }

  return (
    <button
      onClick={toggle}
      data-tour="theme"
      className="inline-flex items-center justify-center w-9 h-9 rounded-full border border-paper-dark bg-paper-secondary text-ink-secondary hover:text-accent hover:border-accent/50 transition-all duration-300"
      aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
      title={theme === "dark" ? "Thème clair" : "Thème sombre"}
    >
      {theme === "dark" ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}
