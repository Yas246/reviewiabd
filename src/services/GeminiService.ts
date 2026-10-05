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
import { generateId, retryWithBackoff, sleep, batchArray, shuffleArray } from "@/lib/utils";
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
  [Domain.ANALYSE_CONCEPTION]:
    "Analyse et Conception: UML (diagrammes de classes, séquence, cas d'utilisation), Merise (MCD, MLD, MCP), MVC, design patterns (Factory, Singleton, Observer), cycle en V vs méthodes agiles, agrégation/composition, héritage, couplage et cohésion.",
  [Domain.GESTION_PROJET]:
    "Gestion de Projet Informatique: chef de projet et rôles, Scrum (Product Owner, Scrum Master, sprints, rituels), méthodes agiles vs cycle en V, risques projet, WIP, indicateurs de performance, qualité logicielle, planning et répartition des tâches.",
  [Domain.BASES_DONNEES_SQL]:
    "Bases de Données et SQL: modèle relationnel, requêtes SELECT/JOIN/GROUP BY, sous-requêtes, index et optimisation, transactions et ACID, normalisation, contraintes d'intégrité, vues, ETL.",
  [Domain.R_PYTHON_DATA]:
    "Python et R: data frames, valeurs manquantes (NA), dplyr et tidyverse, lecture de CSV, Pandas (DataFrame, groupby, merge), NumPy, statistiques descriptives (moyenne, médiane), visualisation (ggplot2, matplotlib).",
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

  return `Tu es un expert pédagogique en Intelligence Artificielle et Big Data qui prépare des étudiants aux examens nationaux IABD du Bénin. Génère ${count} questions à choix multiple (QCM) sur le domaine suivant:

${domainContext}${difficultyText}${previousQuestionsText}

RÈGLES DE QUALITÉ STRICTES (obligatoires) :
1. POSITION ALÉATOIRE : la bonne réponse doit apparaître à des positions DIFFÉRENTES d'une question à l'autre (A, B, C, D équirépartis sur le lot). Ne place jamais toutes les bonnes réponses au même endroit.
2. LONGUEURS HOMOGÈNES : les mauvaises réponses (distracteurs) doivent avoir la même longueur, le même niveau de détail et le même style que la bonne réponse. La bonne réponse ne doit JAMAIS être reconnaissable parce qu'elle est plus longue ou plus précise.
3. DISTRACTEURS PLAUSIBLES : chaque mauvaise réponse représente une confusion fréquente et réaliste du cours (jamais une absurdité évidente).
4. NOTE PAR OPTION : chaque option a un champ "note" d'une phrase : pourquoi elle est fausse (la confusion qu'elle piège) ; pour la bonne réponse, pourquoi elle est juste.
5. Champ "explanation" : 2-3 phrases sur la bonne réponse, SANS jamais mentionner de lettres d'options ("l'option A" interdit).
6. Français accentué impeccable, vocabulaire exact du programme, une notion par question.

IMPORTANT: Tu dois répondre UNIQUEMENT avec un tableau JSON valide contenant les questions. Pas de texte avant ou après le JSON.

Format attendu pour chaque question:
{
  "question": "texte de la question",
  "answers": [
    {"text": "première option", "isCorrect": false, "note": "pourquoi c'est faux"},
    {"text": "deuxième option", "isCorrect": true, "note": "pourquoi c'est juste"},
    {"text": "troisième option", "isCorrect": false, "note": "pourquoi c'est faux"},
    {"text": "quatrième option", "isCorrect": false, "note": "pourquoi c'est faux"}
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
  difficulty?: "easy" | "medium" | "hard",
): Question[] {
  console.log(
    "[Gemini] Parsing questions, content length:",
    content.length,
  );

  try {
    // Strip Gemma thinking tokens (<|channel>thought...<channel|>)
    content = content.replace(/<\|channel\|>thought[\s\S]*?<channel\|>/g, "");
    content = content.replace(/<\|[^|]+\|>/g, "");

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

    // Last resort: find the outermost JSON array by bracket matching
    if (!jsonContent.trim().startsWith("[")) {
      const firstBracket = content.indexOf("[");
      const lastBracket = content.lastIndexOf("]");
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        jsonContent = content.substring(firstBracket, lastBracket + 1);
        console.log("[Gemini] Extracted JSON by bracket matching (fallback)");
      }
    }

    const questionsData = JSON.parse(jsonContent);

    if (!Array.isArray(questionsData)) {
      throw new Error("Response is not an array");
    }

    // Validation stricte + mélange des options à l'arrivée (anti-biais de position)
    const questions: Question[] = [];
    questionsData.forEach((q: any) => {
      if (!q.question || !q.answers || !Array.isArray(q.answers)) {
        throw new Error("Invalid question structure");
      }

      const answers = q.answers.map((a: any, i: number) => ({
        id: `ai-${generateId()}-${i}`,
        text: String(a.text || "").trim(),
        isCorrect: a.isCorrect === true,
        note: typeof a.note === "string" ? a.note : undefined,
      }));
      const correctCount = answers.filter((a: any) => a.isCorrect).length;
      if (answers.length < 2 || correctCount !== 1) {
        console.warn("[Gemini] Question rejected (options/correct invalid), skipping");
        return;
      }

      questions.push({
        id: generateId(),
        domain,
        type: QuestionType.SINGLE_CHOICE,
        question: String(q.question),
        answers: shuffleArray(answers),
        explanation: q.explanation || "",
        difficulty: difficulty || "medium",
        tags: [domain],
        source: "ai",
        createdAt: new Date(),
      });
    });

    if (questions.length === 0) {
      throw new Error("Aucune question valide dans la réponse de l'IA");
    }

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
      // Some models (e.g. gemma-4 with thinking) return thought parts — filter them out
      let responseText = "";
      if (data.candidates && data.candidates[0]?.content?.parts) {
        const parts = data.candidates[0].content.parts;
        const nonThoughtParts = parts.filter((p: any) => p.text && !p.thought);
        responseText = nonThoughtParts.map((p: any) => p.text).join("")
          || parts.find((p: any) => p.text)?.text || "";
      } else {
        throw new Error("Unexpected response format from Gemini API");
      }

      console.log("[Gemini] Response text length:", responseText.length);
      console.log("[Gemini] Response text preview:", responseText.substring(0, 200) + "...");

      const questions = parseQuestionsFromResponse(responseText, domain, difficulty);

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
      // Filter out thought parts for reasoning models (e.g. gemma-4)
      let responseText = "";
      if (response.candidates && response.candidates[0]?.content?.parts) {
        const parts = response.candidates[0].content.parts;
        const nonThoughtParts = parts.filter((p: any) => p.text && !p.thought);
        responseText = nonThoughtParts.map((p: any) => p.text).join("")
          || parts.find((p: any) => p.text)?.text || "";
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
      // Strip Gemma thinking tokens
      content = content.replace(/<\|channel\|>thought[\s\S]*?<channel\|>/g, "");
      content = content.replace(/<\|[^|]+\|>/g, "");

      // Try to extract JSON from markdown code blocks
      let jsonContent: string;
      const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      } else {
        // Try to find array directly
        const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (arrayMatch) {
          jsonContent = arrayMatch[0];
        } else {
          // Last resort: bracket matching
          const firstBracket = content.indexOf("[");
          const lastBracket = content.lastIndexOf("]");
          if (firstBracket !== -1 && lastBracket > firstBracket) {
            jsonContent = content.substring(firstBracket, lastBracket + 1);
          } else {
            jsonContent = content;
          }
        }
      }

      const questionsData = JSON.parse(jsonContent);

      if (!Array.isArray(questionsData)) {
        throw new Error("Response is not an array");
      }

      // Validation stricte + mélange des options à l'arrivée (anti-biais de position)
      const questions: Question[] = [];
      questionsData.forEach((q: any) => {
        if (!q.question || !q.answers || !Array.isArray(q.answers) || !q.domain) {
          throw new Error("Invalid question structure - missing required fields");
        }

        // Validate domain
        if (!expectedDomains.includes(q.domain as Domain)) {
          console.warn(
            `[Gemini] Question has unexpected domain: ${q.domain}. Expected one of: ${expectedDomains.join(", ")}`,
          );
        }

        const answers = q.answers.map((a: any, i: number) => ({
          id: `ai-${generateId()}-${i}`,
          text: String(a.text || "").trim(),
          isCorrect: a.isCorrect === true,
          note: typeof a.note === "string" ? a.note : undefined,
        }));
        const correctCount = answers.filter((a: any) => a.isCorrect).length;
        if (answers.length < 2 || correctCount !== 1) {
          console.warn("[Gemini] Question rejected (options/correct invalid), skipping");
          return;
        }

        questions.push({
          id: generateId(),
          domain: q.domain as Domain,
          type: QuestionType.SINGLE_CHOICE,
          question: String(q.question),
          answers: shuffleArray(answers),
          explanation: q.explanation || "",
          difficulty: "medium",
          tags: [q.domain as Domain],
          source: "ai",
          createdAt: new Date(),
        });
      });

      if (questions.length === 0) {
        throw new Error("Aucune question valide dans la réponse de l'IA");
      }

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
