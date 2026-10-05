import { Domain, Question, QuestionType, EXAM_SAFE_TYPES } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";
import { shuffleArray } from "@/lib/utils";

// ============================================
// QUESTION BANK SERVICE
// Banque locale unifiée : questions préchargées
// (store exercises) + questions importées
// (store questions). Permet de réviser 100 %
// hors ligne, sans clé API.
// ============================================

export interface BankStats {
  total: number;
  byDomain: Partial<Record<Domain, number>>;
}

export interface PickOptions {
  domain?: Domain;
  count: number;
  difficulty?: Question["difficulty"];
  types?: QuestionType[];
  shuffleAnswers?: boolean; // remélange les options à chaque tirage (défaut: true)
  avoidIds?: string[]; // questions à éviter si possible
}

class QuestionBankService {
  private cache: Question[] | null = null;
  private cacheAt = 0;
  private readonly CACHE_TTL_MS = 60_000;

  /**
   * Construit (ou rafraîchit) la banque locale en mémoire.
   */
  private async getBank(force = false): Promise<Question[]> {
    const now = Date.now();
    if (!force && this.cache && now - this.cacheAt < this.CACHE_TTL_MS) {
      return this.cache;
    }

    await indexedDBService.init();
    const [exercises, imported] = await Promise.all([
      indexedDBService.getAllExercises(),
      indexedDBService.getAllQuestions(),
    ]);

    const preloaded = exercises
      .filter((ex) => ex.id.startsWith("preloaded-"))
      .flatMap((ex) => ex.questions || []);

    const seen = new Set<string>();
    const bank: Question[] = [];
    for (const q of [...preloaded, ...imported]) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      bank.push(q);
    }

    this.cache = bank;
    this.cacheAt = now;
    return bank;
  }

  /**
   * Invalide le cache (après un import de questions par exemple).
   */
  invalidate(): void {
    this.cache = null;
  }

  /**
   * Statistiques de la banque par domaine.
   */
  async getStats(): Promise<BankStats> {
    const bank = await this.getBank();
    const byDomain: Partial<Record<Domain, number>> = {};
    bank.forEach((q) => {
      byDomain[q.domain] = (byDomain[q.domain] || 0) + 1;
    });
    return { total: bank.length, byDomain };
  }

  /**
   * Tire N questions de la banque selon les critères.
   * Essaie d'éviter les IDs fournis (déjà vues) si la banque le permet.
   */
  async pick(options: PickOptions): Promise<Question[]> {
    const bank = await this.getBank();
    const { domain, count, difficulty, types, shuffleAnswers = true } = options;

    let pool = bank;
    if (domain) pool = pool.filter((q) => q.domain === domain);
    if (difficulty) pool = pool.filter((q) => q.difficulty === difficulty);
    if (types && types.length > 0) {
      pool = pool.filter((q) => types.includes(q.type));
    }

    // Priorité aux questions non encore vues (avoidIds), complète avec le reste
    const avoid = new Set(options.avoidIds || []);
    const fresh = shuffleArray(pool.filter((q) => !avoid.has(q.id)));
    const seen = shuffleArray(pool.filter((q) => avoid.has(q.id)));
    const picked = [...fresh, ...seen].slice(0, Math.max(0, count));

    if (shuffleAnswers) {
      return picked.map((q) => this.shuffleQuestionAnswers(q));
    }
    return picked;
  }

  /**
   * Tirage équilibré pour un examen blanc : répartit les questions
   * sur les domaines fournis, au plus maxPerDomain par domaine.
   */
  async pickBalanced(
    domains: Domain[],
    total: number,
    maxPerDomain = 4,
    options?: { avoidIds?: string[] }
  ): Promise<Question[]> {
    const perDomain = Math.min(maxPerDomain, Math.ceil(total / Math.max(1, domains.length)));
    const avoid = new Set(options?.avoidIds || []);
    const result: Question[] = [];

    const rotated = shuffleArray(domains);
    for (const domain of rotated) {
      if (result.length >= total) break;
      const wanted = Math.min(perDomain, total - result.length);
      const picked = await this.pick({
        domain,
        count: wanted,
        types: EXAM_SAFE_TYPES,
        avoidIds: [...avoid],
      });
      picked.forEach((q) => avoid.add(q.id));
      result.push(...picked);
    }

    // Complète si pas assez
    if (result.length < total) {
      const avoidIds = result.map((q) => q.id);
      const extra = await this.pick({
        count: total - result.length,
        types: EXAM_SAFE_TYPES,
        avoidIds,
      });
      result.push(...extra);
    }

    return shuffleArray(result).slice(0, total);
  }

  /**
   * Retourne une question par son id (banque préchargée ou importée).
   */
  async getQuestion(id: string): Promise<Question | undefined> {
    const bank = await this.getBank();
    return bank.find((q) => q.id === id);
  }

  /**
   * Remélange les options d'une question (copie profonde des answers).
   * Les notes par option suivent leur texte, donc le mélange reste cohérent.
   */
  shuffleQuestionAnswers(question: Question): Question {
    return {
      ...question,
      answers: shuffleArray(
        question.answers.map((a) => ({ ...a }))
      ),
    };
  }
}

// Singleton instance
export const questionBank = new QuestionBankService();
