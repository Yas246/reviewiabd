import {
  Question,
  Domain,
  QuestionType,
  QuestionGenerationRequest,
  GenerationProgressCallback,
  APIError,
  IAIService,
} from "@/types";
import { generateId, retryWithBackoff, sleep, batchArray } from "@/lib/utils";
import { storageService } from "./StorageService";

// ============================================
// GEMINI SERVICE
// Handles AI question generation via Google Gemini API
// ============================================

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const BATCH_SIZE = 10;
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

// Domain prompts for question generation (same as OpenRouter)
const DOMAIN_PROMPTS: Record<Domain, string> = {
  [Domain.MACHINE_LEARNING]:
    "Machine Learning Fondamental: algorithmes supervisés, non supervisés, régression, classification, clustering, evaluation de modèles, biais/variance, overfitting/underfitting.",
  [Domain.IA_SYMBOLIQUE]:
    "IA Symbolique: systèmes experts, logique propositionnelle, SAT, planification, représentation des connaissances, raisonnement, graphes de recherche.",
  [Domain.DATA_WAREHOUSING]:
    "Data Warehousing: ETL, architecture en étoile/flacon, schémas dimensionnels, modélisation, data marts, SCD, optimisation de requêtes.",
  [Domain.BIG_DATA]:
    "Big Data: frameworks distribués (Hadoop, Spark), NoSQL, streaming, MapReduce, scalabilité, partitionnement, sharding, CAP theorem.",
  [Domain.SYSTEMES_RECOMMANDATION]:
    "Systèmes de Recommandation: filtrage collaboratif, contenu, hybride, matrix factorization, cold start, évaluation, biais, fairité.",
  [Domain.DATA_MINING]:
    "Data Mining: pattern discovery, association rules, sequential pattern mining, outlier detection, preprocessing, feature engineering, validation.",
  [Domain.DEEP_LEARNING]:
    "Deep Learning: réseaux de neurones, CNN, RNN, LSTM, Transformer, backpropagation, activation functions, optimisation, regularisation.",
  [Domain.VISUALISATION_DONNEES]:
    "Visualisation de Données: principes de perception, types de graphiques, interaction, dashboards, storytelling, outils (D3.js, matplotlib), best practices.",
  [Domain.ETHIQUE_IA]:
    "Éthique de l'IA: biais algorithmiques, équité, accountability, transparence, vie privée, impact social, régulation, AI act, responsible AI.",
  [Domain.NLP]:
    "Traitement du Langage Naturel: tokenization, embeddings, attention, transformers, BERT, GPT, sentiment analysis, traduction, NER, langage vs parole.",
};

// Prompt template for question generation (adapted for Gemini)
function generatePrompt(
  domain: Domain,
  count: number,
  difficulty?: "easy" | "medium" | "hard",
): string {
  const domainContext = DOMAIN_PROMPTS[domain];
  const difficultyText = difficulty
    ? ` Niveau de difficulté: ${difficulty}.`
    : "";

  return `Tu es un expert pédagogique en Intelligence Artificielle et Big Data. Génère ${count} questions à choix multiple (QCM) sur le domaine suivant:

${domainContext}${difficultyText}

IMPORTANT: Tu dois répondre UNIQUEMENT avec un tableau JSON valide contenant les questions. Pas de texte avant ou après le JSON.

Format attendu pour chaque question:
{
  "question": "texte de la question",
  "answers": [
    {"text": "réponse A", "isCorrect": false},
    {"text": "réponse B", "isCorrect": true},
    {"text": "réponse C", "isCorrect": false},
    {"text": "réponse D", "isCorrect": false}
  ],
  "explanation": "explication détaillée de la bonne réponse"
}

Contraintes:
- Les questions doivent être techniques et précises
- Une seule bonne réponse par question
- 4 choix de réponse par question
- L'explication doit être concise (2-3 phrases maximum)
- Les questions doivent couvrir différents aspects du domaine
- Inclure des questions pratiques et théoriques

IMPORTANT: Assure-toi que le JSON est complet et bien formé. Ne coupe pas ta réponse.

Génère maintenant les ${count} questions au format JSON tableau:`;
}

// Parse questions from API response (adapted for Gemini)
function parseQuestionsFromResponse(
  content: string,
  domain: Domain,
): Question[] {
  console.log(
    "[Gemini] Parsing questions, content length:",
    content.length,
  );

  try {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonContent = content;

    // Try to extract from markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonContent = codeBlockMatch[1];
      console.log("[Gemini] Extracted JSON from code block");
    } else {
      // Try to find array directly
      const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
        jsonContent = arrayMatch[0];
        console.log("[Gemini] Found JSON array directly");
      }
    }

    const questionsData = JSON.parse(jsonContent);

    if (!Array.isArray(questionsData)) {
      throw new Error("Response is not an array");
    }

    const questions: Question[] = questionsData.map((q: any) => {
      if (!q.question || !q.answers || !Array.isArray(q.answers)) {
        throw new Error("Invalid question structure");
      }

      return {
        id: generateId(),
        domain,
        type: QuestionType.SINGLE_CHOICE,
        question: q.question,
        answers: q.answers.map((a: any) => ({
          id: generateId(),
          text: a.text,
          isCorrect: a.isCorrect || false,
        })),
        explanation: q.explanation || "",
        difficulty: "medium",
        tags: [domain],
        createdAt: new Date(),
      };
    });

    console.log("[Gemini] Successfully parsed", questions.length, "questions");
    return questions;
  } catch (error) {
    console.error("[Gemini] Failed to parse questions:", error);
    console.error("[Gemini] Response content:", content);
    throw {
      message: "Failed to parse AI response. Please try again.",
      code: "PARSE_ERROR",
      isRetryable: true,
    };
  }
}

/**
 * Create API error object from fetch response
 */
function createAPIError(
  message: string,
  status?: number,
): APIError {
  // Authentication error
  if (status === 401 || status === 403) {
    return {
      message: "Invalid API key. Please check your configuration.",
      code: "INVALID_API_KEY",
      statusCode: status,
      isRetryable: false,
    };
  }

  // Rate limit error
  if (status === 429) {
    return {
      message: "Rate limit exceeded. Please try again later.",
      code: "RATE_LIMIT",
      statusCode: status,
      isRetryable: true,
    };
  }

  // Server error
  if (status && status >= 500) {
    return {
      message: "Server error. Please try again later.",
      code: "SERVER_ERROR",
      statusCode: status,
      isRetryable: true,
    };
  }

  return {
    message,
    statusCode: status,
    isRetryable: false,
  };
}

class GeminiService implements IAIService {
  /**
   * Validate API key with a minimal request
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      console.log("[Gemini] Validating API key...");

      const response = await fetch(
        `${GEMINI_API_URL}?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: "Hello"
              }]
            }],
          }),
        }
      );

      console.log("[Gemini] Validation response status:", response.status);

      if (response.ok) {
        console.log("[Gemini] API key is valid");
        return true;
      }

      const error = await response.json();
      console.error("[Gemini] API key validation failed:", error);
      return false;
    } catch (error) {
      console.error("[Gemini] API key validation error:", error);
      return false;
    }
  }

  /**
   * Generate questions using Gemini API
   */
  async generateQuestions(
    options: {
      domain: Domain;
      count: number;
      difficulty?: "easy" | "medium" | "hard";
      includeExplanations: boolean;
    },
    onProgress?: GenerationProgressCallback,
  ): Promise<Question[]> {
    const { domain, count, difficulty } = options;

    console.log("[Gemini] generateQuestions called with:", {
      domain,
      count,
      difficulty,
    });

    try {
      // Get API key from settings (IMPORTANT: Read fresh each time!)
      const settings = await storageService.getSettings();
      const apiKey = settings.geminiApiKey;

      if (!apiKey) {
        throw {
          message: "Gemini API key not configured. Please check your settings.",
          code: "NO_API_KEY",
          isRetryable: false,
        };
      }

      console.log("[Gemini] Using API key starting with:", apiKey.substring(0, 10) + "...");

      // Split into batches if needed
      const batches = batchArray(Array.from({ length: count }, (_, i) => i), BATCH_SIZE);
      const allQuestions: Question[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batchCount = batches[i].length;
        const batchNumber = i + 1;
        const totalBatches = batches.length;

        console.log(`[Gemini] Processing batch ${batchNumber}/${totalBatches} (${batchCount} questions)`);

        const questions = await this.generateQuestionsBatch({
          domain,
          count: batchCount,
          difficulty,
          includeExplanations: true,
        });

        allQuestions.push(...questions);

        if (onProgress) {
          onProgress({
            current: allQuestions.length,
            total: count,
            batch: questions,
          });
        }

        console.log(`[Gemini] Batch ${batchNumber}/${totalBatches} completed. Total questions: ${allQuestions.length}/${count}`);
      }

      console.log(`[Gemini] Generation completed! Total questions: ${allQuestions.length}`);
      return allQuestions;
    } catch (error: any) {
      console.error("[Gemini] Error in generateQuestions:", error);
      throw error;
    }
  }

  /**
   * Generate a batch of questions via Gemini API
   */
  async generateQuestionsBatch(
    request: QuestionGenerationRequest,
  ): Promise<Question[]> {
    const { domain, count, difficulty } = request;

    try {
      // Get API key from settings (IMPORTANT: Read fresh each time!)
      const settings = await storageService.getSettings();
      const apiKey = settings.geminiApiKey;

      if (!apiKey) {
        throw {
          message: "Gemini API key not configured. Please check your settings.",
          code: "NO_API_KEY",
          isRetryable: false,
        };
      }

      const prompt = generatePrompt(domain, count, difficulty);

      console.log("[Gemini] Starting batch generation:", {
        domain,
        count,
        difficulty,
        promptLength: prompt.length,
      });
      console.log("[Gemini] Prompt being sent to API:");
      console.log("---PROMPT START---");
      console.log(prompt);
      console.log("---PROMPT END---");

      console.log("[Gemini] Sending HTTP request to Gemini API...");
      const startTime = Date.now();

      const response = await retryWithBackoff(
        async () => {
          const url = `${GEMINI_API_URL}?key=${apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: prompt
                }]
              }],
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 12000,
              }
            }),
          });

          console.log("[Gemini] Response status:", res.status);

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error("[Gemini] API error response:", errorData);
            throw createAPIError(
              errorData.error?.message || errorData.message || "API request failed",
              res.status
            );
          }

          return res;
        },
        MAX_RETRIES,
        BASE_DELAY
      );

      const duration = Date.now() - startTime;
      console.log(`[Gemini] Request completed in ${duration}ms`);

      const data = await response.json();
      console.log("[Gemini] Response received, parsing...");

      // Extract text from Gemini response format
      // Gemini returns: { candidates: [{ content: { parts: [{ text }] } }] }
      let responseText = "";
      if (data.candidates && data.candidates[0]?.content?.parts) {
        responseText = data.candidates[0].content.parts[0].text || "";
      } else {
        throw new Error("Unexpected response format from Gemini API");
      }

      console.log("[Gemini] Response text length:", responseText.length);
      console.log("[Gemini] Response text preview:", responseText.substring(0, 200) + "...");

      const questions = parseQuestionsFromResponse(responseText, domain);

      if (questions.length !== count) {
        console.warn(
          `[Gemini] Warning: Expected ${count} questions but got ${questions.length}`
        );
      }

      return questions;
    } catch (error: any) {
      console.error("[Gemini] Failed to generate questions:", error);

      // Check if it's already an APIError
      if (error.code) {
        throw error;
      }

      // Otherwise wrap in APIError
      throw {
        message: error.message || "Failed to generate questions",
        code: "GENERATION_ERROR",
        isRetryable: true,
      };
    }
  }
}

// Singleton instance
export const geminiService = new GeminiService();
