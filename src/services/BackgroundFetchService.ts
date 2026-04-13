// ============================================
// BACKGROUND FETCH SERVICE
// Wraps the Background Fetch API for Android
// to continue API calls when app is backgrounded
// ============================================

// Extend ServiceWorkerRegistration to include backgroundFetch
interface ServiceWorkerRegistrationWithBG extends ServiceWorkerRegistration {
  backgroundFetch: {
    fetch(
      id: string,
      requests: Request[],
      options?: {
        title?: string;
        icons?: { src: string; sizes: string }[];
        downloadTotal?: number;
      }
    ): Promise<BackgroundFetchRegistration>;
  };
}

interface BackgroundFetchRegistration {
  id: string;
}

class BackgroundFetchService {
  private supported: boolean;

  constructor() {
    this.supported =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "BackgroundFetchManager" in window;
  }

  /**
   * Check if Background Fetch API is supported
   */
  isSupported(): boolean {
    return this.supported;
  }

  /**
   * Register a background fetch for a single batch API call.
   * Returns the fetch registration ID, or null if unsupported/failed.
   */
  async registerBatchFetch(options: {
    sessionId: string;
    batchIndex: number;
    url: string;
    body: string;
    headers: Record<string, string>;
  }): Promise<string | null> {
    if (!this.supported) return null;

    try {
      const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistrationWithBG;
      const fetchId = `quiz-batch-${options.sessionId}-batch${options.batchIndex}`;

      await registration.backgroundFetch.fetch(
        fetchId,
        [
          new Request(options.url, {
            method: "POST",
            headers: options.headers,
            body: options.body,
          }),
        ],
        {
          title: `Génération de questions (${options.batchIndex + 1})...`,
          icons: [{ src: "/icon-192.png", sizes: "192x192" }],
          downloadTotal: 50000,
        }
      );

      console.log("[BackgroundFetch] Registered:", fetchId);
      return fetchId;
    } catch (error) {
      console.error("[BackgroundFetch] Registration failed:", error);
      return null;
    }
  }
}

// Singleton instance
export const backgroundFetchService = new BackgroundFetchService();
