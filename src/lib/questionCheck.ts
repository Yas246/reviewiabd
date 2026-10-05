import {
  Question,
  QuestionType,
  UserAnswer,
  CodeLanguage,
} from "@/types";

// ============================================
// QUESTION CHECKING
// Logique unifiée de correction pour tous les
// types de questions (QCM simple/multi, V/F,
// trous, code, cas pratique).
// ============================================

/**
 * Normalise une réponse texte : trim, casse, accents, ponctuation finale.
 * Permet d'accepter "k-means", "K-Means", "k means"...
 */
export function normalizeAnswerText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.!?;]+$/, "");
}

/**
 * Vérifie une réponse d'un trou (texte à trous).
 */
export function isBlankCorrect(
  entered: string,
  accepted: string[]
): boolean {
  const normalized = normalizeAnswerText(entered);
  if (!normalized) return false;
  return accepted.some(
    (candidate) => normalizeAnswerText(candidate) === normalized
  );
}

/**
 * Vérifie les réponses cochées d'une question à choix (single / multi / V-F).
 * - SINGLE_CHOICE et TRUE_FALSE : exactement la bonne option.
 * - MULTIPLE_CHOICE : ensemble de réponses coché = ensemble des bonnes réponses
 *   (tout ou rien, fidèle à la consigne des épreuves).
 */
export function areChoicesCorrect(
  question: Question,
  selectedIds: string[]
): boolean {
  const correctIds = question.answers
    .filter((a) => a.isCorrect)
    .map((a) => a.id)
    .sort();
  const selected = [...selectedIds].sort();
  if (correctIds.length !== selected.length) return false;
  return correctIds.every((id, i) => id === selected[i]);
}

/**
 * Vérifie les trous remplis d'une question FILL_BLANK.
 */
export function areBlanksCorrect(
  question: Question,
  textAnswers: string[] | undefined
): boolean {
  const blanks = question.blanks || [];
  if (blanks.length === 0) return false;
  const answers = textAnswers || [];
  return blanks.every(
    (blank, i) => blank.accepted.length > 0 && isBlankCorrect(answers[i] || "", blank.accepted)
  );
}

/**
 * Vérifie les réponses d'un cas pratique via l'auto-évaluation.
 * Une sous-question est validée si tous ses points de grille sont cochés.
 */
export function isCaseStudyCorrect(
  question: Question,
  rubricChecked: boolean[][] | undefined
): boolean {
  const subs = question.subQuestions || [];
  if (subs.length === 0) return false;
  const checked = rubricChecked || [];
  return subs.every((sub, i) => {
    const row = checked[i] || [];
    return sub.rubric.length > 0 && sub.rubric.every((_, j) => row[j]);
  });
}

/**
 * Fraction de points obtenus sur une question (0..1).
 * - Choix / trous : 0 ou 1.
 * - CODE : fraction de tests passés (codeScore fourni par le runner).
 * - CASE_STUDY : fraction de points de grille cochés (selfScore fourni par l'UI).
 */
export function getQuestionScore(
  question: Question,
  answer: UserAnswer | undefined
): number {
  if (!answer) return 0;

  switch (question.type) {
    case QuestionType.CODE:
      return typeof answer.codeScore === "number"
        ? Math.max(0, Math.min(1, answer.codeScore))
        : 0;
    case QuestionType.CASE_STUDY: {
      const subs = question.subQuestions || [];
      const checked = (answer as UserAnswer & { rubricChecked?: boolean[][] }).rubricChecked || [];
      let earned = 0;
      let total = 0;
      subs.forEach((sub, i) => {
        total += sub.rubric.length;
        const row = checked[i] || [];
        earned += sub.rubric.filter((_, j) => row[j]).length;
      });
      return total === 0 ? 0 : earned / total;
    }
    case QuestionType.FILL_BLANK:
      return areBlanksCorrect(question, answer.textAnswers) ? 1 : 0;
    default:
      return areChoicesCorrect(question, answer.selectedAnswerIds || []) ? 1 : 0;
  }
}

/**
 * La question est-elle considérée comme réussie ?
 * (code : tous les tests ; cas pratique : au moins 70 % de la grille)
 */
export function isQuestionPassed(question: Question, answer: UserAnswer | undefined): boolean {
  if (!answer) return false;
  if (question.type === QuestionType.CODE) {
    return getQuestionScore(question, answer) >= 1;
  }
  if (question.type === QuestionType.CASE_STUDY) {
    return getQuestionScore(question, answer) >= 0.7;
  }
  return getQuestionScore(question, answer) === 1;
}

/**
 * Le type de question permet-il la correction objective automatique ?
 * (les cas pratiques dépendent de l'auto-évaluation)
 */
export function isAutoGradable(question: Question): boolean {
  return question.type !== QuestionType.CASE_STUDY;
}

/**
 * Langage par défaut d'un runtime (pour affichage).
 */
export function languageLabel(language: CodeLanguage): string {
  switch (language) {
    case "python":
      return "Python (Pandas)";
    case "r":
      return "R";
    case "sql":
      return "SQL (SQLite)";
  }
}
