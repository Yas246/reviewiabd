import { Domain, Question, QuestionType } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";

// ============================================
// PRE-GENERATED QUESTIONS LOADER
// Charge les fichiers JSON de questions dans
// IndexedDB au premier lancement (banque locale,
// utilisable 100 % hors ligne). Bump du flag :
// re-import automatique quand les fichiers changent.
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
  ANALYSE_CONCEPTION: "/questions/ANALYSE_CONCEPTION.json",
  GESTION_PROJET: "/questions/GESTION_PROJET.json",
  BASES_DONNEES_SQL: "/questions/BASES_DONNEES_SQL.json",
  R_PYTHON_DATA: "/questions/R_PYTHON_DATA.json",
};

const LOADED_FLAG = "preloaded_questions_v8";

// ============================================
// RAW FORMAT (from JSON files)
// Simple : {options, answer} / Complet : {answers, type, ...}
// ============================================

interface RawQuestionSimple {
  id: string;
  question: string;
  options: string[]; // ["A) text", "B) text", ...]
  answer: string; // "A", "B", "C", or "D"
  explanation: string;
}

interface RawAnswer {
  id: string;
  text: string;
  isCorrect: boolean;
  note?: string;
}

interface RawQuestionFull {
  id: string;
  domain?: string;
  type?: string;
  question: string;
  answers?: RawAnswer[];
  explanation?: string;
  difficulty?: string;
  tags?: string[];
  context?: string;
  blanks?: { accepted: string[] }[];
  code?: Question["code"];
  subQuestions?: Question["subQuestions"];
}

type RawQuestion = RawQuestionSimple | RawQuestionFull;

function isSimpleFormat(raw: RawQuestion): raw is RawQuestionSimple {
  return "options" in raw && "answer" in raw;
}

/**
 * Shuffle an array using Fisher-Yates, returning a new array.
 */
function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

const CHOICE_TYPES = new Set<string>([
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
]);

/**
 * Transform raw question data (simple or full format) into the app's Question interface.
 * Shuffle les options des questions à choix pour la variété.
 */
function transformQuestion(raw: RawQuestion, domain: string): Question {
  if (isSimpleFormat(raw)) {
    const answerLetter = raw.answer.toUpperCase();
    const answerMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const correctIndex = answerMap[answerLetter] ?? 0;

    const stripPrefix = (opt: string) => opt.replace(/^[A-D]\)\s*/i, "").trim();

    const answers = raw.options.map((opt, i) => ({
      id: `${raw.id}_${String.fromCharCode(97 + i)}`,
      text: stripPrefix(opt),
      isCorrect: i === correctIndex,
    }));

    return {
      id: raw.id,
      domain: domain as Domain,
      type: QuestionType.SINGLE_CHOICE,
      question: raw.question,
      answers: shuffleArray(answers),
      explanation: raw.explanation,
      difficulty: "medium" as const,
      tags: [domain.toLowerCase()],
      source: "preloaded" as const,
      createdAt: new Date(),
    };
  }

  const type = (raw.type as QuestionType) || QuestionType.SINGLE_CHOICE;
  const answers = (raw.answers || []).map((a) => ({ ...a }));

  return {
    id: raw.id,
    domain: (raw.domain || domain) as Domain,
    type,
    question: raw.question,
    answers:
      CHOICE_TYPES.has(type) && answers.length > 0 ? shuffleArray(answers) : answers,
    explanation: raw.explanation || "",
    difficulty: (raw.difficulty as Question["difficulty"]) || "medium",
    tags: raw.tags || [],
    source: "preloaded" as const,
    context: raw.context,
    blanks: raw.blanks,
    code: raw.code,
    subQuestions: raw.subQuestions,
    createdAt: new Date(),
  };
}

class PreloadedQuestionsService {
  /**
   * Load all pre-generated question files into IndexedDB.
   * Only runs once (checked via localStorage flag).
   * onProgress : feedback pour la barre de chargement du premier lancement.
   */
  async loadAllIfNeeded(
    onProgress?: (done: number, total: number, label: string) => void
  ): Promise<void> {
    if (typeof window === "undefined") return;

    await this.cleanupOldExercises();

    const alreadyLoaded = localStorage.getItem(LOADED_FLAG);
    if (alreadyLoaded) {
      return;
    }

    console.log("[PreloadedQuestions] Loading pre-generated questions...");
    await indexedDBService.init();

    const entries = Object.entries(DOMAIN_FILES);
    let totalLoaded = 0;
    let done = 0;

    for (const [domain, filePath] of entries) {
      onProgress?.(done, entries.length, domain);
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

        const questions: Question[] = rawQuestions.map((q) =>
          transformQuestion(q, domain)
        );

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
      } finally {
        done++;
        onProgress?.(done, entries.length, domain);
      }
    }

    // Purge les anciens flags
    localStorage.removeItem("preloaded_questions_v5");
    localStorage.removeItem("preloaded_questions_v6");
    localStorage.setItem(LOADED_FLAG, new Date().toISOString());
    console.log(`[PreloadedQuestions] Done! Total: ${totalLoaded} questions loaded.`);
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
        console.log(`[PreloadedQuestions] Cleaned up ${stale.length} stale exercises`);
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
