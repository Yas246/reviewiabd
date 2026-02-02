import { indexedDBService } from "./IndexedDBService";
import { UserSettings, Domain } from "@/types";

// ============================================
// STORAGE SERVICE
// High-level API for managing user settings
// and preferences
// ============================================

const DEFAULT_SETTINGS: UserSettings = {
  apiKey: "",
  model: "z-ai/glm-4.5-air:free",
  defaultModel: "z-ai/glm-4.5-air:free",
  notifyOnComplete: true,
  offlineQuestionsPerDomain: 10,
  onboardingCompleted: false,
  updatedAt: new Date(),
};

class StorageService {
  private settingsCache: UserSettings | null = null;

  /**
   * Initialize storage service
   */
  async init(): Promise<void> {
    await indexedDBService.init();
    const settings = await this.getSettings();
    if (settings) {
      this.settingsCache = settings;
    }
  }

  // ============================================
  // SETTINGS MANAGEMENT
  // ============================================

  /**
   * Get user settings
   */
  async getSettings(): Promise<UserSettings> {
    if (this.settingsCache) {
      return this.settingsCache;
    }

    const settings = await indexedDBService.getSettings();
    if (settings) {
      this.settingsCache = settings;
      return settings;
    }

    // Return default settings if none exist
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save user settings
   */
  async saveSettings(settings: UserSettings): Promise<void> {
    const updatedSettings = {
      ...settings,
      updatedAt: new Date(),
    };

    await indexedDBService.saveSettings(updatedSettings);
    this.settingsCache = updatedSettings;
  }

  /**
   * Update specific settings
   */
  async updateSettings(
    updates: Partial<UserSettings>
  ): Promise<UserSettings> {
    const currentSettings = await this.getSettings();
    const updatedSettings = {
      ...currentSettings,
      ...updates,
      updatedAt: new Date(),
    };

    await this.saveSettings(updatedSettings);
    return updatedSettings;
  }

  // ============================================
  // API KEY MANAGEMENT
  // ============================================

  /**
   * Get API key
   */
  async getApiKey(): Promise<string> {
    const settings = await this.getSettings();
    return settings.apiKey;
  }

  /**
   * Set API key
   */
  async setApiKey(apiKey: string): Promise<void> {
    await this.updateSettings({ apiKey });
  }

  /**
   * Check if API key is configured
   */
  async hasApiKey(): Promise<boolean> {
    const apiKey = await this.getApiKey();
    return apiKey.length > 0;
  }

  /**
   * Validate API key format
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    return apiKey.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(apiKey);
  }

  /**
   * Clear API key
   */
  async clearApiKey(): Promise<void> {
    await this.setApiKey("");
  }

  // ============================================
  // MODEL MANAGEMENT
  // ============================================

  /**
   * Get current model
   */
  async getModel(): Promise<string> {
    const settings = await this.getSettings();
    return settings.model;
  }

  /**
   * Set model
   */
  async setModel(model: string): Promise<void> {
    await this.updateSettings({ model });
  }

  /**
   * Get available models
   */
  getAvailableModels(): Array<{ id: string; name: string; free: boolean }> {
    return [
      {
        id: "z-ai/glm-4.5-air:free",
        name: "GLM 4.5 Air (Free)",
        free: true,
      },
      {
        id: "openai/gpt-oss-120b:free",
        name: "GPT-OSS 120B (Free)",
        free: true,
      },
      {
        id: "google/gemma-3-27b-it:free",
        name: "Gemma 3 27B (Free)",
        free: true,
      },
      {
        id: "meta-llama/llama-3.3-8b-instruct:free",
        name: "Llama 3.3 8B (Free)",
        free: true,
      },
      {
        id: "anthropic/claude-3-haiku",
        name: "Claude 3 Haiku",
        free: false,
      },
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o Mini",
        free: false,
      },
    ];
  }

  /**
   * Get model name by ID
   */
  getModelName(modelId: string): string {
    const models = this.getAvailableModels();
    const model = models.find((m) => m.id === modelId);
    return model?.name || modelId;
  }

  // ============================================
  // ONBOARDING MANAGEMENT
  // ============================================

  /**
   * Check if onboarding is completed
   */
  async isOnboardingCompleted(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.onboardingCompleted;
  }

  /**
   * Complete onboarding
   */
  async completeOnboarding(): Promise<void> {
    await this.updateSettings({ onboardingCompleted: true });
  }

  /**
   * Reset onboarding (for testing)
   */
  async resetOnboarding(): Promise<void> {
    await this.updateSettings({ onboardingCompleted: false });
  }

  // ============================================
  // NOTIFICATION PREFERENCES
  // ============================================

  /**
   * Check if notifications are enabled
   */
  async areNotificationsEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.notifyOnComplete;
  }

  /**
   * Toggle notifications
   */
  async toggleNotifications(): Promise<boolean> {
    const settings = await this.getSettings();
    const newValue = !settings.notifyOnComplete;
    await this.updateSettings({ notifyOnComplete: newValue });
    return newValue;
  }

  // ============================================
  // OFFLINE SETTINGS
  // ============================================

  /**
   * Get offline questions per domain setting
   */
  async getOfflineQuestionsPerDomain(): Promise<number> {
    const settings = await this.getSettings();
    return settings.offlineQuestionsPerDomain;
  }

  /**
   * Set offline questions per domain
   */
  async setOfflineQuestionsPerDomain(count: number): Promise<void> {
    // Clamp between 5 and 50
    const clampedCount = Math.max(5, Math.min(50, count));
    await this.updateSettings({ offlineQuestionsPerDomain: clampedCount });
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  /**
   * Clear settings cache
   */
  clearCache(): void {
    this.settingsCache = null;
  }

  /**
   * Refresh settings from database
   */
  async refreshSettings(): Promise<UserSettings> {
    this.clearCache();
    return await this.getSettings();
  }

  // ============================================
  // DATA EXPORT/IMPORT
  // ============================================

  /**
   * Export user data (settings + favorites)
   */
  async exportUserData(): Promise<string> {
    const settings = await this.getSettings();
    const favorites = await indexedDBService.getAllFavorites();

    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      favorites,
    });
  }

  /**
   * Import user data
   */
  async importUserData(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);

      if (data.settings) {
        await this.saveSettings(data.settings);
      }

      if (data.favorites && Array.isArray(data.favorites)) {
        // Clear existing favorites and import new ones
        await indexedDBService.clearFavorites();
        for (const favorite of data.favorites) {
          await indexedDBService.addFavorite(favorite);
        }
      }
    } catch (error) {
      console.error("Failed to import user data:", error);
      throw new Error("Invalid import data format");
    }
  }

  // ============================================
  // RESET
  // ============================================

  /**
   * Reset all settings to defaults
   */
  async resetSettings(): Promise<void> {
    await this.saveSettings({ ...DEFAULT_SETTINGS });
  }

  /**
   * Clear all application data
   */
  async clearAllData(): Promise<void> {
    await indexedDBService.clearAll();
    this.clearCache();
  }
}

// Singleton instance
export const storageService = new StorageService();
