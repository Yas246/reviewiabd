import {
  Question,
  Domain,
  QuestionType,
  QuestionGenerationRequest,
  QuestionGenerationResponse,
  GenerationProgressCallback,
  APIError,
  IAIService,
} from "@/types";
import { generateId, retryWithBackoff, sleep, batchArray } from "@/lib/utils";
import { storageService } from "./StorageService";

// ============================================
// OPENROUTER SERVICE
// Handles AI question generation via OpenRouter API
// ============================================

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const BATCH_SIZE = 10; // Reduced from 10 to avoid truncation
const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

// Domain prompts for question generation
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

// Prompt template for question generation
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

// Parse questions from API response
function parseQuestionsFromResponse(
  content: string,
  domain: Domain,
): Question[] {
  console.log(
    "[OpenRouter] Parsing questions, content length:",
    content.length,
  );

  try {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonContent = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*(\[.*?\])\s*```/s);
    if (jsonMatch) {
      jsonContent = jsonMatch[1];
      console.log("[OpenRouter] Found markdown code block");
    } else {
      // Try to extract array directly
      const arrayMatch = content.match(/\[.*\]/s);
      if (arrayMatch) {
        jsonContent = arrayMatch[0];
        console.log("[OpenRouter] Found array directly");
      }
    }

    console.log("[OpenRouter] Extracted JSON length:", jsonContent.length);
    console.log(
      "[OpenRouter] JSON preview (first 500 chars):",
      jsonContent.substring(0, Math.min(500, jsonContent.length)),
    );

    // Check if JSON appears truncated (common issue with token limits)
    const trimmed = jsonContent.trim();
    if (!trimmed.endsWith("]") || !trimmed.startsWith("[")) {
      console.error("[OpenRouter] JSON appears malformed or truncated");
      console.error(
        "[OpenRouter] Last 200 chars:",
        jsonContent.substring(Math.max(0, jsonContent.length - 200)),
      );
      throw new Error(
        "JSON appears truncated or malformed - response may have been cut off due to token limits",
      );
    }

    const questionsData = JSON.parse(jsonContent);

    if (!Array.isArray(questionsData)) {
      console.error(
        "[OpenRouter] Response is not an array, type:",
        typeof questionsData,
      );
      throw new Error("Response is not an array");
    }

    console.log(
      "[OpenRouter] Successfully parsed array, length:",
      questionsData.length,
    );

    return questionsData.map((q: any, index: number) => {
      // Validate and create Question object
      if (!q.question || !q.answers || !Array.isArray(q.answers)) {
        console.error(`[OpenRouter] Invalid question at index ${index}:`, q);
        throw new Error(`Invalid question format at index ${index}`);
      }

      return {
        id: generateId(),
        domain,
        type: QuestionType.SINGLE_CHOICE,
        question: q.question,
        answers: q.answers.map((a: any, i: number) => ({
          id: `${generateId()}-${i}`,
          text: a.text || a.answer,
          isCorrect: a.isCorrect || a.correct || false,
        })),
        explanation: q.explanation || "",
        difficulty: "medium",
        tags: [domain],
        createdAt: new Date(),
      };
    });
  } catch (error) {
    console.error("[OpenRouter] Failed to parse questions:", error);
    console.error("[OpenRouter] Content that failed to parse:", content);
    throw new Error("Invalid response format from AI");
  }
}

// API error handler
function handleAPIError(error: any): APIError {
  if (error.response) {
    const status = error.response.status;
    const message = error.response.data?.error?.message || error.message;

    // Rate limiting
    if (status === 429) {
      return {
        message: "Rate limit exceeded. Please wait.",
        code: "RATE_LIMIT",
        statusCode: status,
        isRetryable: true,
      };
    }

    // Authentication error
    if (status === 401 || status === 403) {
      return {
        message: "Invalid API key. Please check your configuration.",
        code: "INVALID_API_KEY",
        statusCode: status,
        isRetryable: false,
      };
    }

    // Server error
    if (status >= 500) {
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

  return {
    message: error.message || "Unknown error occurred",
    isRetryable: false,
  };
}

class OpenRouterService implements IAIService {
  /**
   * Generate a batch of questions via OpenRouter API
   */
  async generateQuestionsBatch(
    request: QuestionGenerationRequest,
  ): Promise<Question[]> {
    const { domain, count, difficulty } = request;

    try {
      // Get API key and model from StorageService
      const apiKey = await storageService.getApiKey();
      const model = await storageService.getModel();

      if (!apiKey) {
        throw {
          message: "API key not configured. Please complete onboarding.",
          code: "NO_API_KEY",
          isRetryable: false,
        };
      }

      const prompt = generatePrompt(domain, count, difficulty);

      console.log("[OpenRouter] Starting batch generation:", {
        domain,
        count,
        model,
        difficulty,
        promptLength: prompt.length,
      });
      console.log("[OpenRouter] Prompt being sent to API:");
      console.log("---PROMPT START---");
      console.log(prompt);
      console.log("---PROMPT END---");

      console.log("[OpenRouter] Sending HTTP request to OpenRouter API...");
      const startTime = Date.now();

      const response = await retryWithBackoff(
        async () => {
          const res = await fetch(OPENROUTER_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer":
                typeof window !== "undefined" ? window.location.href : "",
              "X-Title": "Review IABD",
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content:
                    "Tu es un expert pédagogique en IA et Big Data. Tu génères des QCM de haute qualité, techniques et précis.",
                },
                {
                  role: "user",
                  content: prompt,
                },
              ],
              temperature: 0.7,
              max_tokens: 12000, // Increased from 4000 to avoid truncation
            }),
          });

          console.log("[OpenRouter] Response status:", res.status);

          if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            console.error("[OpenRouter] Error response:", error);
            throw {
              response: {
                status: res.status,
                data: error,
              },
            };
          }

          const data = await res.json();
          const requestDuration = Date.now() - startTime;
          console.log("[OpenRouter] HTTP Response received:", {
            statusCode: res.status,
            duration: `${requestDuration}ms`,
            id: data.id,
            choices: data.choices?.length,
            usage: data.usage,
          });

          return data;
        },
        MAX_RETRIES,
        BASE_DELAY,
      );

      const content = response.choices?.[0]?.message?.content;

      console.log("[OpenRouter] Extracting content from response...");
      console.log("[OpenRouter] Content details:", {
        length: content?.length,
        hasContent: !!content,
        previewFirst200: content?.substring(0, 200),
      });
      console.log("[OpenRouter] Full content received:");
      console.log("---CONTENT START---");
      console.log(content);
      console.log("---CONTENT END---");

      if (!content) {
        console.error("[OpenRouter] Empty response - full response:", response);
        throw new Error("Empty response from API");
      }

      console.log("[OpenRouter] Starting JSON parsing...");
      const questions = parseQuestionsFromResponse(content, domain);
      console.log(
        "[OpenRouter] Successfully parsed and validated questions:",
        questions.length,
      );

      return questions;
    } catch (error: any) {
      const apiError = handleAPIError(error);
      throw apiError;
    }
  }

  /**
   * Generate multiple questions in batches
   */
  async generateQuestions(
    request: QuestionGenerationRequest,
    onProgress?: GenerationProgressCallback,
  ): Promise<Question[]> {
    const { count, domain } = request;
    const allQuestions: Question[] = [];
    const totalBatches = Math.ceil(count / BATCH_SIZE);

    console.log("[OpenRouter] ===== STARTING QUESTION GENERATION =====");
    console.log("[OpenRouter] Request details:", {
      domain,
      count,
      difficulty: request.difficulty,
      includeExplanations: request.includeExplanations,
      batchSize: BATCH_SIZE,
      totalBatches,
      timestamp: new Date().toISOString(),
    });

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      console.log(
        `[OpenRouter] --- Starting batch ${batchIndex + 1}/${totalBatches} ---`,
      );

      const batchSize = Math.min(BATCH_SIZE, count - batchIndex * BATCH_SIZE);

      try {
        console.log(
          `[OpenRouter] Batch ${batchIndex + 1}: calling generateQuestionsBatch with ${batchSize} questions`,
        );
        const batchQuestions = await this.generateQuestionsBatch({
          ...request,
          count: batchSize,
        });
        console.log(
          `[OpenRouter] Batch ${batchIndex + 1}: received ${batchQuestions.length} questions`,
        );

        allQuestions.push(...batchQuestions);

        // Report progress
        if (onProgress) {
          console.log(
            `[OpenRouter] Batch ${batchIndex + 1}: reporting progress ${allQuestions.length}/${count}`,
          );
          onProgress({
            current: allQuestions.length,
            total: count,
            batch: batchQuestions,
          });
        }

        // Small delay between batches to avoid rate limiting
        if (batchIndex < totalBatches - 1) {
          console.log(
            `[OpenRouter] Batch ${batchIndex + 1}: waiting 500ms before next batch`,
          );
          await sleep(500);
        }
      } catch (error: any) {
        console.error(`[OpenRouter] Batch ${batchIndex + 1} FAILED:`, error);
        throw error;
      }
    }

    console.log("[OpenRouter] ===== QUESTION GENERATION COMPLETED =====");
    console.log("[OpenRouter] Final results:", {
      totalGenerated: allQuestions.length,
      requested: count,
      totalBatches,
      timestamp: new Date().toISOString(),
    });

    return allQuestions;
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b:free",
          messages: [
            {
              role: "user",
              content: "Test",
            },
          ],
          max_tokens: 5,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const openRouterService = new OpenRouterService();
