import { Domain, Question, QuestionType } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";

// ============================================
// PRE-GENERATED QUESTIONS LOADER
// Loads bundled JSON question files into IndexedDB
// on first app launch for offline use
// ============================================

const DOMAIN_FILES: Record<string, string> = {
  MACHINE_LEARNING: "/questions/MACHINE_LEARNING.json",
  IA_SYMBOLIQUE: "/questions/IA_SYMBOLIQUE.json",
  DATA_WAREHOUSING: "/questions/DATA_WAREHOUSING.json",
  BIG_DATA: "/questions/BIG_DATA.json",
  SYSTEMES_RECOMMANDATION: "/questions/SYSTEMES_RECOMMANDATION.json",
  DATA_MINING: "/questions/DATA_MINING.json",
  DEEP_LEARNING: "/questions/DEEP_LEARNING.json",
  VISUALISATION_DONNEES: "/questions/VISUALISATION_DONNEES.json",
  ETHIQUE_IA: "/questions/ETHIQUE_IA.json",
  NLP: "/questions/NLP.json",
};

const LOADED_FLAG = "preloaded_questions_v4";

// ============================================
// RAW FORMAT (from JSON files)
// Some files use the simple format: {options, answer}
// Others use the full format: {answers, domain, type, ...}
// ============================================

interface RawQuestionSimple {
  id: string;
  question: string;
  options: string[];  // ["A) text", "B) text", ...]
  answer: string;     // "A", "B", "C", or "D"
  explanation: string;
}

interface RawQuestionFull {
  id: string;
  domain: string;
  type: string;
  question: string;
  answers: { id: string; text: string; isCorrect: boolean }[];
  explanation: string;
  difficulty: string;
  tags: string[];
}

type RawQuestion = RawQuestionSimple | RawQuestionFull;

function isSimpleFormat(raw: RawQuestion): raw is RawQuestionSimple {
  return "options" in raw && "answer" in raw;
}

/**
 * Transform raw question data (simple or full format) into the app's Question interface.
 */
function transformQuestion(raw: RawQuestion, domain: string): Question {
  if (isSimpleFormat(raw)) {
    const answerLetter = raw.answer.toUpperCase();
    const answerMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const correctIndex = answerMap[answerLetter] ?? 0;

    // Strip "A) ", "B) ", etc. prefix from option text
    const stripPrefix = (opt: string) => opt.replace(/^[A-D]\)\s*/i, "").trim();

    return {
      id: raw.id,
      domain: domain as Domain,
      type: QuestionType.SINGLE_CHOICE,
      question: raw.question,
      answers: raw.options.map((opt, i) => ({
        id: `${raw.id}_${String.fromCharCode(97 + i)}`,
        text: stripPrefix(opt),
        isCorrect: i === correctIndex,
      })),
      explanation: raw.explanation,
      difficulty: "medium" as const,
      tags: [domain.toLowerCase()],
      createdAt: new Date(),
    };
  }

  // Already in full format
  return {
    ...raw,
    domain: raw.domain as Domain,
    type: (raw.type as QuestionType) || QuestionType.SINGLE_CHOICE,
    difficulty: (raw.difficulty as "easy" | "medium" | "hard") || "medium",
    tags: raw.tags || [],
    createdAt: new Date(),
  };
}

class PreloadedQuestionsService {
  /**
   * Load all pre-generated question files into IndexedDB.
   * Only runs once (checked via localStorage flag).
   */
  async loadAllIfNeeded(): Promise<void> {
    if (typeof window === "undefined") return;

    // Always clean up old preloaded exercises (handles v1/v2 leftovers)
    await this.cleanupOldExercises();

    const alreadyLoaded = localStorage.getItem(LOADED_FLAG);
    if (alreadyLoaded) {
      console.log("[PreloadedQuestions] Already loaded, skipping.");
      return;
    }

    console.log("[PreloadedQuestions] Loading pre-generated questions...");
    await indexedDBService.init();

    let totalLoaded = 0;

    for (const [domain, filePath] of Object.entries(DOMAIN_FILES)) {
      try {
        const response = await fetch(filePath);
        if (!response.ok) {
          console.warn(`[PreloadedQuestions] File not found: ${filePath}`);
          continue;
        }

        const rawQuestions: RawQuestion[] = await response.json();

        if (!rawQuestions || rawQuestions.length === 0) {
          console.warn(`[PreloadedQuestions] Empty file: ${filePath}`);
          continue;
        }

        // Transform raw questions into app format
        const questions: Question[] = rawQuestions.map((q) =>
          transformQuestion(q, domain)
        );

        // Use deterministic ID so re-saves overwrite instead of creating duplicates
        const exerciseId = `preloaded-${domain}`;
        await indexedDBService.saveExercise({
          id: exerciseId,
          domain: domain as Domain,
          questions,
          createdAt: new Date(),
          used: false,
        });

        totalLoaded += questions.length;
        console.log(
          `[PreloadedQuestions] Loaded ${questions.length} questions for ${domain}`
        );
      } catch (error) {
        console.error(`[PreloadedQuestions] Error loading ${filePath}:`, error);
      }
    }

    // Mark as loaded
    localStorage.setItem(LOADED_FLAG, new Date().toISOString());
    console.log(
      `[PreloadedQuestions] Done! Total: ${totalLoaded} questions loaded.`
    );
  }

  /**
   * Clean up old preloaded exercises (stale format, duplicates from v1/v2).
   */
  private async cleanupOldExercises(): Promise<void> {
    try {
      await indexedDBService.init();
      const allExercises = await indexedDBService.getAllExercises();
      const stale = allExercises.filter(
        (ex) => ex.id.startsWith("preloaded-") && ex.id !== `preloaded-${ex.domain}`
      );
      for (const ex of stale) {
        await indexedDBService.deleteExercise(ex.id);
      }
      if (stale.length > 0) {
        console.log(
          `[PreloadedQuestions] Cleaned up ${stale.length} stale exercises`
        );
      }
    } catch {
      // Non-fatal
    }
  }

  /**
   * Force reload all pre-generated questions (for updates).
   */
  async forceReload(): Promise<void> {
    localStorage.removeItem(LOADED_FLAG);
    await this.loadAllIfNeeded();
  }

  /**
   * Check if pre-generated questions have been loaded.
   */
  isLoaded(): boolean {
    return typeof window !== "undefined" && !!localStorage.getItem(LOADED_FLAG);
  }
}

// Singleton instance
export const preloadedQuestionsService = new PreloadedQuestionsService();
