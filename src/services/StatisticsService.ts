import { indexedDBService } from "./IndexedDBService";
import { Domain, QuizSession, SavedExam, UserStatistics } from "@/types";

// ============================================
// STATISTICS SERVICE
// Calculates and manages user statistics
// ============================================

class StatisticsService {
  private stats: UserStatistics | null = null;
  private initialized = false;

  /**
   * Initialize statistics by loading from DB or calculating from scratch
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    console.log('[StatisticsService] Initializing...');
    const savedStats = await indexedDBService.getStatistics();

    if (savedStats) {
      console.log('[StatisticsService] Loaded saved statistics:', savedStats);
      this.stats = savedStats;
    } else {
      console.log('[StatisticsService] No saved statistics, calculating from data...');
      this.stats = await this.calculateFromScratch();
      await this.save();
    }

    this.initialized = true;
  }

  /**
   * Get current statistics (initializes if needed)
   */
  async getStatistics(): Promise<UserStatistics> {
    if (!this.initialized) {
      await this.init();
    }
    return this.stats!;
  }

  /**
   * Calculate all statistics from sessions and exams
   */
  private async calculateFromScratch(): Promise<UserStatistics> {
    console.log('[StatisticsService] Calculating statistics from scratch...');

    const [allSessions, allExams, favorites] = await Promise.all([
      indexedDBService.getAllSessions(),
      indexedDBService.getAllExams(),
      indexedDBService.getAllFavorites(),
    ]);

    // Filter completed sessions (both practice and exam)
    const completedSessions = allSessions.filter(
      (s) => s.status === "COMPLETED"
    );

    console.log('[StatisticsService] Found', completedSessions.length, 'completed sessions');

    // Calculate total questions answered
    let totalQuestionsAnswered = 0;
    let totalCorrectAnswers = 0;
    let totalStudyTime = 0;

    // Domain progress tracking
    const domainsProgress: Record<Domain, {
      questionsAnswered: number;
      correctAnswers: number;
      averageScore: number;
    }> = {} as any;

    // Initialize all domains
    Object.values(Domain).forEach((d) => {
      domainsProgress[d] = {
        questionsAnswered: 0,
        correctAnswers: 0,
        averageScore: 0,
      };
    });

    // Process each completed session
    completedSessions.forEach((session) => {
      const sessionQuestions = session.questions || [];
      const sessionUserAnswers = session.userAnswers || {};

      // Count questions answered in this session
      const answeredCount = Object.keys(sessionUserAnswers).length;
      totalQuestionsAnswered += answeredCount;

      // Calculate time spent
      if (session.startedAt && session.completedAt) {
        const timeSpent = Math.floor(
          (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
        );
        totalStudyTime += timeSpent;
      }

      // Count correct answers and track by domain
      sessionQuestions.forEach((question) => {
        const userAnswer = sessionUserAnswers[question.id];
        if (userAnswer) {
          const isCorrect = userAnswer.isCorrect;
          if (isCorrect) {
            totalCorrectAnswers++;
          }

          // Update domain progress
          const domain = question.domain;
          if (domain && domainsProgress[domain]) {
            domainsProgress[domain].questionsAnswered++;
            if (isCorrect) {
              domainsProgress[domain].correctAnswers++;
            }
          }
        }
      });
    });

    // Count exams taken (unique completed exam sessions)
    const examSessions = completedSessions.filter((s) => s.type === "exam");
    const totalExamsTaken = examSessions.length;

    // Calculate average score across all sessions
    let totalScore = 0;
    let scoreCount = 0;

    completedSessions.forEach((session) => {
      const sessionScore = this.calculateSessionScore(session);
      if (sessionScore !== null) {
        totalScore += sessionScore;
        scoreCount++;
      }
    });

    const averageScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0;

    // Calculate average score per domain
    Object.keys(domainsProgress).forEach((domain) => {
      const progress = domainsProgress[domain as Domain];
      if (progress.questionsAnswered > 0) {
        progress.averageScore = Math.round(
          (progress.correctAnswers / progress.questionsAnswered) * 100
        );
      }
    });

    // Get favorite question IDs
    const favoriteQuestionIds = favorites.map((q) => q.id);

    const statistics: UserStatistics = {
      totalQuestionsAnswered,
      totalCorrectAnswers,
      totalExamsTaken,
      averageScore,
      totalStudyTime,
      favoriteQuestions: favoriteQuestionIds,
      domainsProgress,
    };

    console.log('[StatisticsService] Calculated statistics:', statistics);
    return statistics;
  }

  /**
   * Calculate score for a single session
   */
  private calculateSessionScore(session: QuizSession): number | null {
    if (!session.questions || !session.userAnswers) return null;

    let correct = 0;
    let answered = 0;

    session.questions.forEach((q) => {
      const userAnswer = session.userAnswers[q.id];
      if (userAnswer) {
        answered++;
        if (userAnswer.isCorrect) {
          correct++;
        }
      }
    });

    return answered > 0 ? Math.round((correct / answered) * 100) : null;
  }

  /**
   * Update statistics after a session is completed
   */
  async updateFromSession(session: QuizSession): Promise<void> {
    if (session.status !== "COMPLETED") {
      console.log('[StatisticsService] Session not completed, skipping update');
      return;
    }

    console.log('[StatisticsService] Updating statistics from session:', session.id);

    if (!this.initialized) {
      await this.init();
    }

    const sessionQuestions = session.questions || [];
    const sessionUserAnswers = session.userAnswers || {};

    // Count answered questions in this session
    const answeredCount = Object.keys(sessionUserAnswers).length;
    this.stats!.totalQuestionsAnswered += answeredCount;

    // Count correct answers
    let sessionCorrect = 0;
    sessionQuestions.forEach((question) => {
      const userAnswer = sessionUserAnswers[question.id];
      if (userAnswer) {
        if (userAnswer.isCorrect) {
          sessionCorrect++;
          this.stats!.totalCorrectAnswers++;
        }

        // Update domain progress
        const domain = question.domain;
        if (domain && this.stats!.domainsProgress[domain]) {
          this.stats!.domainsProgress[domain].questionsAnswered++;
          if (userAnswer.isCorrect) {
            this.stats!.domainsProgress[domain].correctAnswers++;
          }
          // Recalculate domain average
          this.stats!.domainsProgress[domain].averageScore = Math.round(
            (this.stats!.domainsProgress[domain].correctAnswers /
              this.stats!.domainsProgress[domain].questionsAnswered) * 100
          );
        }
      }
    });

    // Update exam count
    if (session.type === "exam") {
      this.stats!.totalExamsTaken++;
    }

    // Update study time
    if (session.startedAt && session.completedAt) {
      const timeSpent = Math.floor(
        (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 1000
      );
      this.stats!.totalStudyTime += timeSpent;
    }

    // Recalculate average score
    const sessionScore = answeredCount > 0 ? Math.round((sessionCorrect / answeredCount) * 100) : 0;
    const totalSessions = await this.getTotalCompletedSessions();
    this.stats!.averageScore = Math.round(
      ((this.stats!.averageScore * (totalSessions - 1)) + sessionScore) / totalSessions
    );

    await this.save();
    console.log('[StatisticsService] Statistics updated:', this.stats);
  }

  /**
   * Get total number of completed sessions
   */
  private async getTotalCompletedSessions(): Promise<number> {
    const allSessions = await indexedDBService.getAllSessions();
    return allSessions.filter((s) => s.status === "COMPLETED").length;
  }

  /**
   * Update favorites list
   */
  async updateFavorites(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }

    const favorites = await indexedDBService.getAllFavorites();
    this.stats!.favoriteQuestions = favorites.map((q) => q.id);
    await this.save();
  }

  /**
   * Save statistics to IndexedDB
   */
  private async save(): Promise<void> {
    if (this.stats) {
      await indexedDBService.saveStatistics(this.stats);
    }
  }

  /**
   * Reset all statistics (recalculate from data)
   */
  async reset(): Promise<void> {
    console.log('[StatisticsService] Resetting statistics...');
    this.stats = await this.calculateFromScratch();
    await this.save();
  }

  /**
   * Clear all statistics
   */
  async clear(): Promise<void> {
    console.log('[StatisticsService] Clearing statistics...');
    this.stats = {
      totalQuestionsAnswered: 0,
      totalCorrectAnswers: 0,
      totalExamsTaken: 0,
      averageScore: 0,
      totalStudyTime: 0,
      favoriteQuestions: [],
      domainsProgress: {} as any,
    };

    // Initialize domain progress
    Object.values(Domain).forEach((d) => {
      this.stats!.domainsProgress[d] = {
        questionsAnswered: 0,
        correctAnswers: 0,
        averageScore: 0,
      };
    });

    await this.save();
  }

  /**
   * Get domain-specific statistics
   */
  async getDomainStats(domain: Domain): Promise<{
    questionsAnswered: number;
    correctAnswers: number;
    averageScore: number;
  }> {
    const stats = await this.getStatistics();
    return stats.domainsProgress[domain] || {
      questionsAnswered: 0,
      correctAnswers: 0,
      averageScore: 0,
    };
  }

  /**
   * Get formatted statistics for display
   */
  async getFormattedStats(): Promise<{
    totalQuestions: number;
    totalCorrect: number;
    totalExams: number;
    averageScore: number;
    studyTimeMinutes: number;
    studyTimeHours: number;
    favoriteCount: number;
    domains: Record<Domain, {
      questionsAnswered: number;
      correctAnswers: number;
      averageScore: number;
    }>;
  }> {
    const stats = await this.getStatistics();

    return {
      totalQuestions: stats.totalQuestionsAnswered,
      totalCorrect: stats.totalCorrectAnswers,
      totalExams: stats.totalExamsTaken,
      averageScore: stats.averageScore,
      studyTimeMinutes: Math.floor(stats.totalStudyTime / 60),
      studyTimeHours: Math.floor(stats.totalStudyTime / 3600),
      favoriteCount: stats.favoriteQuestions.length,
      domains: stats.domainsProgress,
    };
  }
}

// Singleton instance
export const statisticsService = new StatisticsService();
