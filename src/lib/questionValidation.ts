import {
  Question,
  QuestionType,
  Domain,
  Answer,
  QuestionSource,
} from "@/types";

// ============================================
// QUESTION VALIDATION
// Validation stricte des questions entrantes
// (import JSON via prompt exportable, génération IA).
// Toute question non conforme est rejetée avec
// une raison claire.
// ============================================

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const DIFFICULTIES = ["easy", "medium", "hard"];
const SOURCES: QuestionSource[] = ["preloaded", "imported", "ai"];

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asAnswer(raw: unknown): Answer | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const text = asString(obj.text);
  if (!text) return undefined;
  return {
    id: asString(obj.id) || `a-${Math.random().toString(36).slice(2, 9)}`,
    text,
    isCorrect: obj.isCorrect === true,
    note: asString(obj.note),
  };
}

/**
 * Valide une question brute (objet JSON quelconque) et retourne
 * une Question normalisée si elle est conforme.
 */
export function validateQuestion(
  raw: unknown,
  defaultDomain?: Domain
): { question?: Question; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["Question ignorée : entrée non objet"] };
  }
  const obj = raw as Record<string, unknown>;

  const questionText = asString(obj.question);
  if (!questionText) errors.push("énoncé (question) manquant");

  const explanation = asString(obj.explanation) || asString(obj.explanationCorrect) || "";

  const domainStr = asString(obj.domain)?.toUpperCase() as Domain | undefined;
  const domain =
    domainStr && Object.values(Domain).includes(domainStr)
      ? domainStr
      : defaultDomain;
  if (!domain) errors.push("domaine manquant ou inconnu");

  const typeStr = (asString(obj.type)?.toUpperCase() as QuestionType) || QuestionType.SINGLE_CHOICE;
  const type = Object.values(QuestionType).includes(typeStr) ? typeStr : undefined;
  if (!type) errors.push(`type inconnu : ${String(obj.type)}`);

  const difficulty = DIFFICULTIES.includes(String(obj.difficulty))
    ? (obj.difficulty as Question["difficulty"])
    : "medium";

  if (errors.length > 0) {
    return { errors };
  }

  const base: Question = {
    id: asString(obj.id) || `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    domain: domain!,
    type: type!,
    question: questionText!,
    answers: [],
    explanation,
    difficulty,
    tags: Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === "string").slice(0, 6)
      : [String(domain!).toLowerCase()],
    source: SOURCES.includes(obj.source as QuestionSource)
      ? (obj.source as QuestionSource)
      : "imported",
    context: asString(obj.context),
    createdAt: new Date(),
  };

  const rawAnswers = Array.isArray(obj.answers) ? obj.answers : [];
  const answers = rawAnswers.map(asAnswer).filter((a): a is Answer => !!a);

  switch (type) {
    case QuestionType.SINGLE_CHOICE: {
      if (answers.length < 2) errors.push("moins de 2 options");
      const correctCount = answers.filter((a) => a.isCorrect).length;
      if (correctCount !== 1) {
        errors.push(`exactement 1 bonne réponse requis, trouvé ${correctCount}`);
      }
      if (answers.length >= 2 && answers.length <= 6) {
        base.answers = answers;
      } else if (answers.length > 0) {
        errors.push(`nombre d'options invalide (${answers.length})`);
      }
      break;
    }
    case QuestionType.TRUE_FALSE: {
      // Deux options attendues : Vrai / Faux. On les reconstruit si absentes.
      if (answers.length === 2) {
        base.answers = answers;
      } else {
        base.answers = [
          { id: "true", text: "Vrai", isCorrect: obj.answer === true || obj.answer === "VRAI" },
          { id: "false", text: "Faux", isCorrect: obj.answer === false || obj.answer === "FAUX" },
        ];
      }
      if (base.answers.filter((a) => a.isCorrect).length !== 1) {
        errors.push("Vrai/Faux sans réponse définie");
      }
      break;
    }
    case QuestionType.MULTIPLE_CHOICE: {
      if (answers.length < 3) errors.push("moins de 3 options");
      const correctCount = answers.filter((a) => a.isCorrect).length;
      if (correctCount < 2) errors.push("au moins 2 bonnes réponses requis");
      if (answers.length >= 3 && answers.length <= 8) {
        base.answers = answers;
      } else if (answers.length > 0) {
        errors.push(`nombre d'options invalide (${answers.length})`);
      }
      break;
    }
    case QuestionType.FILL_BLANK: {
      const rawBlanks = Array.isArray(obj.blanks) ? obj.blanks : [];
      const blanks = rawBlanks
        .map((b: unknown) => {
          if (b && typeof b === "object" && Array.isArray((b as Record<string, unknown>).accepted)) {
            const accepted = ((b as Record<string, unknown>).accepted as unknown[])
              .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
            return accepted.length > 0 ? { accepted } : undefined;
          }
          if (typeof b === "string") return { accepted: [b] };
          return undefined;
        })
        .filter((b): b is { accepted: string[] } => !!b);
      if (blanks.length === 0) errors.push("aucun trou avec réponses acceptées");
      else if (!questionText!.includes("___") && !questionText!.includes("..."))
        errors.push("l'énoncé doit contenir ___ pour marquer le(s) trou(s)");
      base.blanks = blanks;
      break;
    }
    case QuestionType.CODE: {
      const code = obj.code as Record<string, unknown> | undefined;
      if (!code || typeof code !== "object") {
        errors.push("bloc code manquant");
        break;
      }
      const language = asString(code.language)?.toLowerCase();
      if (!["python", "r", "sql"].includes(language || "")) {
        errors.push("langage de code invalide (python, r ou sql)");
        break;
      }
      const solution = asString(code.solution);
      if (!solution) errors.push("solution de référence manquante");
      const rawTests = Array.isArray(code.tests) ? code.tests : [];
      const tests = rawTests
        .map((t: unknown) => {
          if (!t || typeof t !== "object") return undefined;
          const tObj = t as Record<string, unknown>;
          const name = asString(tObj.name) || "Test";
          const testCode = asString(tObj.code);
          if (!testCode) return undefined;
          return { name, hidden: tObj.hidden === true, code: testCode };
        })
        .filter((t): t is { name: string; hidden: boolean; code: string } => !!t);
      if (tests.length === 0 && language !== "sql") errors.push("aucun test de validation");
      base.code = {
        language: language as "python" | "r" | "sql",
        setup: asString(code.setup),
        starter: asString(code.starter),
        solution: solution!,
        tests,
        timeLimitMs:
          typeof code.timeLimitMs === "number" && code.timeLimitMs >= 2000
            ? code.timeLimitMs
            : 10000,
      };
      break;
    }
    case QuestionType.CASE_STUDY: {
      const rawSubs = Array.isArray(obj.subQuestions) ? obj.subQuestions : [];
      const subs = rawSubs
        .map((s: unknown, i: number) => {
          if (!s || typeof s !== "object") return undefined;
          const sObj = s as Record<string, unknown>;
          const subQuestion = asString(sObj.question);
          const answer = asString(sObj.answer);
          if (!subQuestion || !answer) return undefined;
          const rubric = Array.isArray(sObj.rubric)
            ? sObj.rubric.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
            : [];
          return {
            id: asString(sObj.id) || `sq-${i + 1}`,
            question: subQuestion,
            answer,
            rubric: rubric.length > 0 ? rubric : [answer.length > 0 ? "Réponse conforme au corrigé" : "Réponse correcte"],
          };
        })
        .filter((s): s is NonNullable<typeof s> => !!s);
      if (subs.length === 0) errors.push("aucune sous-question complète");
      base.subQuestions = subs;
      break;
    }
  }

  if (errors.length > 0) {
    return { errors };
  }
  return { question: base, errors: [] };
}

/**
 * Valide et normalise un lot de questions (tableau ou JSON texte
 * potentiellement entouré de fences markdown).
 */
export function parseQuestionBatch(
  input: string,
  defaultDomain?: Domain
): { questions: Question[]; failures: { index: number; errors: string[]; raw?: unknown }[] } {
  let text = input.trim();
  // Retire les fences markdown éventuelles
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

  // Cherche le tableau JSON
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Aucun tableau JSON trouvé dans le texte collé");
  }
  text = text.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(
      `JSON invalide : ${(e as Error).message}. Vérifie que le modèle a renvoyé du JSON complet.`
    );
  }

  if (!Array.isArray(parsed)) {
    // Tolère { "questions": [...] }
    const wrapper = parsed as Record<string, unknown>;
    if (wrapper && Array.isArray(wrapper.questions)) {
      parsed = wrapper.questions;
    } else {
      throw new Error("Le JSON n'est pas un tableau de questions");
    }
  }

  const list = parsed as unknown[];
  const questions: Question[] = [];
  const failures: { index: number; errors: string[]; raw?: unknown }[] = [];
  list.forEach((raw: unknown, index: number) => {
    const { question, errors } = validateQuestion(raw, defaultDomain);
    if (question) questions.push(question);
    else failures.push({ index, errors, raw });
  });

  return { questions, failures };
}
