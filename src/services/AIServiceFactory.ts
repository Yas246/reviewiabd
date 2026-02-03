import { AIProvider } from "@/types";
import { openRouterService } from "./OpenRouterService";
import { geminiService } from "./GeminiService";

// ============================================
// AI SERVICE FACTORY
// Factory pattern to get the appropriate AI service
// ============================================

class AIServiceFactory {
  /**
   * Get the AI service based on the provider setting
   */
  getService(provider: AIProvider) {
    switch (provider) {
      case 'gemini':
        console.log("[AIServiceFactory] Using Gemini service");
        return geminiService;
      case 'openrouter':
      default:
        console.log("[AIServiceFactory] Using OpenRouter service");
        return openRouterService;
    }
  }
}

// Singleton instance
export const aiServiceFactory = new AIServiceFactory();
