import {
  Question,
  Domain,
  QuestionType,
  QuestionGenerationRequest,
  MultiDomainQuestionRequest,
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
  previousQuestions?: string[],
): string {
  const domainContext = DOMAIN_PROMPTS[domain];
  const difficultyText = difficulty
    ? ` Niveau de difficulté: ${difficulty}.`
    : "";

  // Add previous questions to avoid duplicates
  const previousQuestionsText = previousQuestions && previousQuestions.length > 0
    ? `\n\nIMPORTANT: Les questions suivantes ont déjà été générées. Tu DOIS générer des questions DIFFÉRENTES qui ne traitent PAS des mêmes sujets:\n\n${previousQuestions.map(q => `- ${q}`).join('\n')}\n\n`
    : "";

  return `Tu es un expert pédagogique en Intelligence Artificielle et Big Data. Génère ${count} questions à choix multiple (QCM) sur le domaine suivant:

${domainContext}${difficultyText}${previousQuestionsText}
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
- CRITIQUE: Chaque nouvelle question doit traiter d'un sujet DIFFÉRENT des questions précédentes

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

      // Use default model for API key validation
      const model = "gemini-2.5-flash";
      const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(
        geminiApiUrl,
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
    request: QuestionGenerationRequest,
    onProgress?: GenerationProgressCallback,
  ): Promise<Question[]> {
    const { domain, count, difficulty } = request;

    console.log("[Gemini] generateQuestions called with:", {
      domain,
      count,
      difficulty,
      previousQuestionsCount: request.previousQuestions?.length || 0,
    });

    try {
      // Get API key and batchSize from settings (IMPORTANT: Read fresh each time!)
      const settings = await storageService.getSettings();
      const apiKey = settings.geminiApiKey;
      const batchSize = settings?.batchSize || 10;

      if (!apiKey) {
        throw {
          message: "Gemini API key not configured. Please check your settings.",
          code: "NO_API_KEY",
          isRetryable: false,
        };
      }

      console.log("[Gemini] Using API key starting with:", apiKey.substring(0, 10) + "...");

      // Split into batches if needed
      const batches = batchArray(Array.from({ length: count }, (_, i) => i), batchSize);
      const allQuestions: Question[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batchCount = batches[i].length;
        const batchNumber = i + 1;
        const totalBatches = batches.length;

        console.log(`[Gemini] Processing batch ${batchNumber}/${totalBatches} (${batchCount} questions)`);

        const questions = await this.generateQuestionsBatch({
          ...request,
          count: batchCount,
        });

        allQuestions.push(...questions);

        // Update previousQuestions for next batch to avoid duplicates
        request.previousQuestions = allQuestions.map(q => q.question);

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
      // Get API key and model from settings (IMPORTANT: Read fresh each time!)
      const settings = await storageService.getSettings();
      const apiKey = settings.geminiApiKey;
      const model = settings.model || "gemini-2.5-flash";

      if (!apiKey) {
        throw {
          message: "Gemini API key not configured. Please check your settings.",
          code: "NO_API_KEY",
          isRetryable: false,
        };
      }

      const prompt = generatePrompt(domain, count, difficulty, request.previousQuestions);

      console.log("[Gemini] Starting batch generation:", {
        domain,
        count,
        model,
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
          const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const url = geminiApiUrl;
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

  /**
   * Generate questions for multiple domains in a single request
   * Useful for exams to reduce API calls from 10 to 4
   */
  async generateMultiDomainQuestions(
    request: MultiDomainQuestionRequest,
    onProgress?: GenerationProgressCallback,
  ): Promise<Question[]> {
    const { domains, countPerDomain, difficulty } = request;
    const totalCount = domains.length * countPerDomain;

    console.log("[Gemini] ===== STARTING MULTI-DOMAIN QUESTION GENERATION =====");
    console.log("[Gemini] Request details:", {
      domains: domains.join(", "),
      countPerDomain,
      totalQuestions: totalCount,
      difficulty,
      includeExplanations: request.includeExplanations,
      previousQuestionsCount: request.previousQuestions?.length || 0,
      timestamp: new Date().toISOString(),
    });

    try {
      // Get API key and model from settings (IMPORTANT: Read fresh each time!)
      const settings = await storageService.getSettings();
      const apiKey = settings.geminiApiKey;
      const model = settings.model || "gemini-2.5-flash";

      if (!apiKey) {
        throw {
          message: "Gemini API key not configured. Please check your settings.",
          code: "NO_API_KEY",
          isRetryable: false,
        };
      }

      console.log("[Gemini] Using API key starting with:", apiKey.substring(0, 10) + "...");
      console.log("[Gemini] Using model:", model);

      // Build the multi-domain prompt
      const prompt = this.generateMultiDomainPrompt(request);

      console.log("[Gemini] Starting multi-domain batch generation:", {
        domains: domains.join(", "),
        totalQuestions: totalCount,
        model,
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
          const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          const url = geminiApiUrl;
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

          if (!res.ok) {
            const error = await res.json();
            console.error("[Gemini] API error response:", error);
            throw new Error(`API error: ${res.status} ${res.statusText}`);
          }

          return res.json();
        },
        MAX_RETRIES,
        BASE_DELAY,
      );

      const endTime = Date.now();
      console.log(`[Gemini] Request completed in ${endTime - startTime}ms`);

      // Extract text from Gemini response format
      let responseText = "";
      if (response.candidates && response.candidates[0]?.content?.parts) {
        responseText = response.candidates[0].content.parts[0].text || "";
      } else {
        throw new Error("Unexpected response format from Gemini API");
      }

      console.log("[Gemini] Response received, length:", responseText.length);

      // Parse questions from response
      const questions = this.parseMultiDomainQuestions(responseText, domains);

      if (questions.length !== totalCount) {
        console.warn(
          `[Gemini] Expected ${totalCount} questions but got ${questions.length}`
        );
      }

      // Report progress
      if (onProgress) {
        onProgress({
          current: questions.length,
          total: totalCount,
          batch: questions,
        });
      }

      console.log("[Gemini] ===== MULTI-DOMAIN QUESTION GENERATION COMPLETED =====");
      console.log("[Gemini] Final results:", {
        totalGenerated: questions.length,
        requested: totalCount,
        domains: domains.join(", "),
        timestamp: new Date().toISOString(),
      });

      return questions;
    } catch (error: any) {
      console.error("[Gemini] Failed to generate multi-domain questions:", error);

      // Check if it's already an APIError
      if (error.code) {
        throw error;
      }

      // Otherwise wrap in APIError
      throw {
        message: error.message || "Failed to generate multi-domain questions",
        code: "GENERATION_ERROR",
        isRetryable: true,
      };
    }
  }

  /**
   * Generate prompt for multi-domain question generation
   */
  private generateMultiDomainPrompt(request: MultiDomainQuestionRequest): string {
    const { domains, countPerDomain, difficulty } = request;
    const domainPrompts = domains.map(
      (domain) => `${DOMAIN_PROMPTS[domain]} (${countPerDomain} questions)`
    ).join("\n\n");

    const difficultyText = difficulty
      ? ` Niveau de difficulté: ${difficulty}.`
      : "";

    const previousQuestionsText = request.previousQuestions && request.previousQuestions.length > 0
      ? `\n\nIMPORTANT: Les questions suivantes ont déjà été générées. Tu DOIS générer des questions DIFFÉRENTES qui ne traitent PAS des mêmes sujets:\n\n${request.previousQuestions.map(q => `- ${q}`).join('\n')}\n\n`
      : "";

    return `Tu es un expert pédagogique en Intelligence Artificielle et Big Data. Génère des questions à choix multiple (QCM) sur les domaines suivants:

${domainPrompts}${difficultyText}${previousQuestionsText}
IMPORTANT: Tu dois répondre UNIQUEMENT avec un tableau JSON valide contenant les questions. Pas de texte avant ou après le JSON.

Pour chaque domaine, génère exactement ${countPerDomain} questions.

Format attendu pour chaque question:
{
  "question": "texte de la question",
  "domain": "MACHINE_LEARNING" | "IA_SYMBOLIQUE" | "DATA_WAREHOUSING" | "BIG_DATA" | "SYSTEMES_RECOMMANDATION" | "DATA_MINING" | "DEEP_LEARNING" | "VISUALISATION_DONNEES" | "ETHIQUE_IA" | "NLP",
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
- CRITIQUE: Le champ "domain" doit correspondre exactement au domaine de la question

IMPORTANT: Assure-toi que le JSON est complet et bien formé. Ne coupe pas ta réponse.

Génère maintenant les questions au format JSON tableau:`;
  }

  /**
   * Parse questions from multi-domain API response
   */
  private parseMultiDomainQuestions(content: string, expectedDomains: Domain[]): Question[] {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : content;

      const questionsData = JSON.parse(jsonContent);

      if (!Array.isArray(questionsData)) {
        throw new Error("Response is not an array");
      }

      const questions: Question[] = questionsData.map((q: any) => {
        if (!q.question || !q.answers || !Array.isArray(q.answers) || !q.domain) {
          throw new Error("Invalid question structure - missing required fields");
        }

        // Validate domain
        if (!expectedDomains.includes(q.domain as Domain)) {
          console.warn(
            `[Gemini] Question has unexpected domain: ${q.domain}. Expected one of: ${expectedDomains.join(", ")}`,
          );
        }

        return {
          id: generateId(),
          domain: q.domain as Domain,
          type: QuestionType.SINGLE_CHOICE,
          question: q.question,
          answers: q.answers.map((a: any) => ({
            id: generateId(),
            text: a.text,
            isCorrect: a.isCorrect || false,
          })),
          explanation: q.explanation || "",
          difficulty: "medium",
          tags: [q.domain as Domain],
          createdAt: new Date(),
        };
      });

      console.log("[Gemini] Successfully parsed", questions.length, "questions from multi-domain response");
      return questions;
    } catch (error: any) {
      console.error("[Gemini] Error parsing multi-domain questions:", error);
      throw new Error(`Failed to parse questions: ${error.message}`);
    }
  }
}

// Singleton instance
export const geminiService = new GeminiService();
