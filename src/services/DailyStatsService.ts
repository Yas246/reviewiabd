import { DailyStat } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";

// ============================================
// DAILY STATS SERVICE
// Activité quotidienne : questions répondues,
// objectifs et série de jours (streak).
// ============================================

export function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateToKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

class DailyStatsService {
  /**
   * Ajoute l'activité d'une session au jour courant.
   */
  async recordActivity(answered: number, correct: number, timeSpentSeconds: number): Promise<void> {
    await indexedDBService.init();
    const key = todayKey();
    const existing = await indexedDBService.getDailyStat(key);
    const stat: DailyStat = existing
      ? {
          ...existing,
          answered: existing.answered + answered,
          correct: existing.correct + correct,
          timeSpent: existing.timeSpent + timeSpentSeconds,
        }
      : { date: key, answered, correct, timeSpent: timeSpentSeconds };
    await indexedDBService.saveDailyStat(stat);
  }

  async getToday(): Promise<DailyStat> {
    const key = todayKey();
    const stat = await indexedDBService.getDailyStat(key);
    return stat || { date: key, answered: 0, correct: 0, timeSpent: 0 };
  }

  /**
   * Série de jours consécutifs ayant atteint l'objectif.
   * Le jour en cours compte s'il est déjà à l'objectif ; sinon
   * la série part d'hier (le jour n'est pas perdu tant qu'il n'est pas fini).
   */
  async getStreak(dailyGoal: number): Promise<number> {
    if (dailyGoal <= 0) return 0;
    const all = await indexedDBService.getAllDailyStats();
    const byDate = new Map(all.map((s) => [s.date, s]));

    let streak = 0;
    const cursor = new Date();

    const today = byDate.get(dateToKey(cursor));
    if (!today || today.answered < dailyGoal) {
      cursor.setDate(cursor.getDate() - 1);
    }

    // Parcourt en arrière tant que l'objectif est atteint
    for (let i = 0; i < 365; i++) {
      const stat = byDate.get(dateToKey(cursor));
      if (stat && stat.answered >= dailyGoal) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Historique des N derniers jours (pour la heatmap / le calendrier).
   */
  async getRecentDays(days: number): Promise<DailyStat[]> {
    const all = await indexedDBService.getAllDailyStats();
    const byDate = new Map(all.map((s) => [s.date, s]));
    const result: DailyStat[] = [];
    const cursor = new Date();
    cursor.setDate(cursor.getDate() - (days - 1));
    for (let i = 0; i < days; i++) {
      const key = dateToKey(cursor);
      result.push(byDate.get(key) || { date: key, answered: 0, correct: 0, timeSpent: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }
}

// Singleton instance
export const dailyStatsService = new DailyStatsService();
