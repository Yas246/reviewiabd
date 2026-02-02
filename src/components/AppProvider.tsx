"use client";

import { useEffect, useState } from "react";
import { indexedDBService } from "@/services/IndexedDBService";
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
      <div className="min-h-screen flex items-center justify-center bg-paper-primary">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Log error if initialization failed (but still render children)
  if (initError) {
    console.warn('[AppProvider] Services failed to initialize, app may have limited functionality:', initError);
  }

  return <>{children}</>;
}
