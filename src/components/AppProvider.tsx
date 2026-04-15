"use client";

import { useEffect, useState } from "react";
import { indexedDBService } from "@/services/IndexedDBService";
import { preloadedQuestionsService } from "@/services/PreloadedQuestionsService";
import { storageService } from "@/services/StorageService";
import { statisticsService } from "@/services/StatisticsService";

// ============================================
// APP PROVIDER
// Initializes services and manages global state
// ============================================

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

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

        // Load pre-generated questions on first launch
        console.log('[AppProvider] Loading pre-generated questions...');
        await preloadedQuestionsService.loadAllIfNeeded();
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

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-paper-primary gap-6">
        <div className="flex flex-col items-center gap-2">
          <h1
            className="text-3xl font-bold text-ink-primary tracking-tight"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            Review IABD
          </h1>
          <p className="text-sm text-ink-muted font-mono">Chargement...</p>
        </div>
        <div className="w-48 h-1 rounded-full bg-(--paper-primary) border border-(--ink-muted)/20 overflow-hidden">
          <div className="loading-bar h-full rounded-full bg-(--accent-vivid)" />
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
