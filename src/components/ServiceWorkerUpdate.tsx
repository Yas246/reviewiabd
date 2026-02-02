"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * ServiceWorkerUpdate Component
 *
 * Displays a notification when a new version of the app is available.
 * The user can click to refresh and get the latest version.
 */
export function ServiceWorkerUpdate() {
  const [showUpdate, setShowUpdate] = useState(false);

  useEffect(() => {
    // Check if update is available in localStorage
    const hasUpdate = localStorage.getItem("swUpdateAvailable") === "true";
    if (hasUpdate) {
      setShowUpdate(true);
    }

    // Listen for custom event from service worker
    const handleUpdateAvailable = () => {
      console.log("[SW Update] Update available event received");
      setShowUpdate(true);
    };

    window.addEventListener("swUpdateAvailable", handleUpdateAvailable);

    return () => {
      window.removeEventListener("swUpdateAvailable", handleUpdateAvailable);
    };
  }, []);

  const handleRefresh = () => {
    console.log("[SW Update] User clicked refresh");
    // Tell the service worker to skip waiting and activate
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration && registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      });
    }
    // Reload the page
    window.location.reload();
  };

  const handleDismiss = () => {
    console.log("[SW Update] User dismissed update notification");
    setShowUpdate(false);
  };

  if (!showUpdate) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[100] animate-fade-in-up">
      <div className="bg-paper-secondary border border-accent rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Download className="w-5 h-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-mono font-semibold text-sm text-accent mb-1">
              Mise à jour disponible
            </h3>
            <p className="text-xs text-ink-secondary">
              Une nouvelle version de l&apos;application est disponible. Cliquez pour mettre à jour.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded hover:bg-paper-dark transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4 text-ink-muted" />
          </button>
        </div>
        <button
          onClick={handleRefresh}
          className="mt-3 w-full btn btn-primary btn-sm"
        >
          Mettre à jour maintenant
        </button>
      </div>
    </div>
  );
}
