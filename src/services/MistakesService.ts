import { MistakeEntry, Question } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";

// ============================================
// MISTAKES SERVICE (cahier d'erreurs + SRS)
// Toute erreur alimente un carnet rejouable.
// Répétition espacée simplifiée : 1j -> 2j -> 4j
// -> 7j -> 14j -> 30j, reset en cas d'erreur.
// Une question est "maîtrisée" après 2 bonnes
// réponses consécutives.
// ============================================

const MASTER_STREAK = 2;
const MAX_HISTORY = 20;
const INTERVALS = [1, 2, 4, 7, 14, 30];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

class MistakesService {
  /**
   * Enregistre le résultat d'une réponse à une question.
   * Une erreur crée (ou remet à zéro) l'entrée du cahier ;
   * une bonne réponse fait progresser le SRS.
   */
  async recordAnswer(question: Question, correct: boolean): Promise<void> {
    // Les cas pratiques auto-évalués en échec et le code raté y vont aussi :
    // tout ce qui n'est pas "réussi" alimente le cahier.
    await indexedDBService.init();
    const now = new Date();
    const existing = await indexedDBService.getMistake(question.id);

    if (!correct) {
      const entry: MistakeEntry = existing
        ? {
            ...existing,
            missedCount: existing.missedCount + 1,
            correctStreak: 0,
            mastered: false,
            lastSeenAt: now,
            srs: { intervalDays: 1, dueAt: addDays(now, 1) },
            history: [
              ...existing.history.slice(-(MAX_HISTORY - 1)),
              { date: now, correct: false },
            ],
          }
        : {
            id: question.id,
            question,
            missedCount: 1,
            timesCorrect: 0,
            correctStreak: 0,
            mastered: false,
            firstMissedAt: now,
            lastSeenAt: now,
            srs: { intervalDays: 1, dueAt: addDays(now, 1) },
            history: [{ date: now, correct: false }],
          };
      await indexedDBService.saveMistake(entry);
      return;
    }

    if (!existing) return; // une réussite sans erreur préalable ne crée pas d'entrée

    const correctStreak = existing.correctStreak + 1;
    const stepIndex = INTERVALS.indexOf(existing.srs.intervalDays);
    const nextInterval =
      INTERVALS[Math.min(INTERVALS.length - 1, (stepIndex === -1 ? 0 : stepIndex) + 1)];

    const updated: MistakeEntry = {
      ...existing,
      timesCorrect: existing.timesCorrect + 1,
      correctStreak,
      mastered: existing.mastered || correctStreak >= MASTER_STREAK,
      lastSeenAt: now,
      srs: { intervalDays: nextInterval, dueAt: addDays(now, nextInterval) },
      history: [
        ...existing.history.slice(-(MAX_HISTORY - 1)),
        { date: now, correct: true },
      ],
    };
    await indexedDBService.saveMistake(updated);
  }

  /**
   * Enregistre tous les résultats d'une session terminée.
   */
  async recordSession(
    questions: Question[],
    results: { questionId: string; correct: boolean }[]
  ): Promise<void> {
    const byId = new Map(questions.map((q) => [q.id, q]));
    for (const r of results) {
      const question = byId.get(r.questionId);
      if (question) {
        await this.recordAnswer(question, r.correct);
      }
    }
  }

  /**
   * Questions du cahier arrivées à échéance (ou toutes si includeAll).
   */
  async getDue(limit?: number, includeMastered = false): Promise<MistakeEntry[]> {
    const now = new Date();
    const all = includeMastered
      ? await indexedDBService.getAllMistakes()
      : await indexedDBService.getActiveMistakes();
    const due = all
      .filter((m) => new Date(m.srs.dueAt).getTime() <= now.getTime())
      .sort((a, b) => new Date(a.srs.dueAt).getTime() - new Date(b.srs.dueAt).getTime());
    return limit ? due.slice(0, limit) : due;
  }

  /**
   * Nombre de questions à réviser aujourd'hui.
   */
  async getDueCount(): Promise<number> {
    const due = await this.getDue();
    return due.length;
  }

  /**
   * Statistiques du cahier.
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    mastered: number;
    dueNow: number;
    byDomain: Record<string, number>;
  }> {
    await indexedDBService.init();
    const [all, dueNow] = await Promise.all([
      indexedDBService.getAllMistakes(),
      this.getDue(),
    ]);
    const active = all.filter((m) => !m.mastered);
    const byDomain: Record<string, number> = {};
    active.forEach((m) => {
      byDomain[m.question.domain] = (byDomain[m.question.domain] || 0) + 1;
    });
    return {
      total: all.length,
      active: active.length,
      mastered: all.length - active.length,
      dueNow: dueNow.length,
      byDomain,
    };
  }

  /**
   * Construit une session de révision depuis les erreurs dues.
   * Les questions sont mélangées au niveau des options pour le challenge.
   */
  async buildReviewSession(limit = 15): Promise<{ questions: Question[]; ids: string[] } | null> {
    const due = await this.getDue(limit);
    if (due.length === 0) return null;
    const { questionBank } = await import("@/services/QuestionBankService");
    const questions = due.map((m) => questionBank.shuffleQuestionAnswers(m.question));
    return { questions, ids: questions.map((q) => q.id) };
  }

  async markMastered(id: string, mastered = true): Promise<void> {
    const entry = await indexedDBService.getMistake(id);
    if (!entry) return;
    await indexedDBService.saveMistake({
      ...entry,
      mastered,
      ...(mastered
        ? {
            correctStreak: Math.max(entry.correctStreak, 2),
            srs: { intervalDays: 30, dueAt: addDays(new Date(), 365) },
          }
        : {}),
    });
  }

  async remove(id: string): Promise<void> {
    await indexedDBService.deleteMistake(id);
  }
}

// Singleton instance
export const mistakesService = new MistakesService();
