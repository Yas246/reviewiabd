"use client";

import { useEffect, useState } from "react";
import { indexedDBService } from "@/services/IndexedDBService";
import { preloadedQuestionsService } from "@/services/PreloadedQuestionsService";
import { storageService } from "@/services/StorageService";
import { statisticsService } from "@/services/StatisticsService";
import { DOMAIN_LABELS } from "@/types";

// ============================================
// APP PROVIDER
// Initializes services and manages global state
// ============================================

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [preload, setPreload] = useState<{ done: number; total: number; label: string } | null>(null);

  useEffect(() => {
    const initializeServices = async () => {
      console.log('[AppProvider] Initializing services...');

      try {
        // Initialize IndexedDB first
        console.log('[AppProvider] Initializing IndexedDB...');
        await indexedDBService.init();
        console.log('[AppProvider] IndexedDB initialized successfully');

        // Initialize StorageService
        console.log('[AppProvider] Initializing StorageService...');
        await storageService.init();
        console.log('[AppProvider] StorageService initialized successfully');

        // Initialize StatisticsService
        console.log('[AppProvider] Initializing StatisticsService...');
        await statisticsService.init();
        console.log('[AppProvider] StatisticsService initialized successfully');

        // Load pre-generated questions on first launch (avec progression)
        console.log('[AppProvider] Loading pre-generated questions...');
        await preloadedQuestionsService.loadAllIfNeeded((done, total, label) => {
          setPreload({ done, total, label });
        });
        setPreload(null);
        console.log('[AppProvider] Pre-generated questions check complete');

        // Log current data for debugging
        const settings = await storageService.getSettings();
        console.log('[AppProvider] Current settings:', {
          hasApiKey: !!settings.apiKey,
          model: settings.model,
          onboardingCompleted: settings.onboardingCompleted,
        });

        const sessions = await indexedDBService.getAllSessions();
        console.log('[AppProvider] Current sessions:', sessions.length);

        const favorites = await indexedDBService.getAllFavorites();
        console.log('[AppProvider] Current favorites:', favorites.length);

        const stats = await statisticsService.getFormattedStats();
        console.log('[AppProvider] Current statistics:', stats);

        setIsInitialized(true);
        console.log('[AppProvider] All services initialized successfully');
      } catch (error) {
        console.error('[AppProvider] Failed to initialize services:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
        // Still set to true so app can render, even if services failed
        setIsInitialized(true);
      }
    };

    initializeServices();
  }, []);

  // Show loading state while initializing (avec progression du 1er import)
  if (!isInitialized) {
    const percent = preload
      ? Math.round((preload.done / Math.max(1, preload.total)) * 100)
      : 0;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper-primary gap-6 px-6">
        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-3xl font-bold text-ink-primary tracking-tight"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Review IABD
          </h1>
          <p className="text-sm text-ink-muted font-mono">
            {preload
              ? "Préparation de ta banque de questions (premier lancement)..."
              : "Chargement..."}
          </p>
        </div>
        <div className="w-64">
          <div className="w-full h-1.5 rounded-full bg-(--paper-secondary) border border-(--ink-muted)/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-(--accent-vivid) transition-all"
              style={{ width: `${preload ? percent : 8}%` }}
            />
          </div>
          {preload && (
            <p className="text-xs text-ink-muted font-mono mt-2 text-center">
              {preload.done} / {preload.total} :{" "}
              {DOMAIN_LABELS[preload.label as keyof typeof DOMAIN_LABELS] ?? preload.label}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Log error if initialization failed (but still render children)
  if (initError) {
    console.warn('[AppProvider] Services failed to initialize, app may have limited functionality:', initError);
  }

  return <>{children}</>;
}
