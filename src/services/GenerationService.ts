import {
  Domain,
  Question,
  QuizSession,
  QuizSessionStatus,
  SavedPracticeQuiz,
  SavedExam,
} from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";
import { storageService } from "@/services/StorageService";
import { notificationService } from "@/services/NotificationService";
import { aiServiceFactory } from "@/services/AIServiceFactory";

// ============================================
// GENERATION SERVICE
// Handles incremental quiz generation with
// per-batch saving, resume, and partial finalization
// ============================================

export interface GenerationCallbacks {
  onBatchComplete?: (progress: {
    current: number;
    total: number;
    batch: Question[];
    batchIndex: number;
    totalBatches: number;
  }) => void;
  onSessionReady?: (sessionId: string) => void;
  onGenerationComplete?: (sessionId: string) => void;
  onGenerationError?: (
    error: { message: string; code?: string; isRetryable: boolean },
    sessionId: string,
    savedCount: number,
    requestedCount: number
  ) => void;
}

// BroadcastChannel for same-tab communication with quiz page
let generationChannel: BroadcastChannel | null = null;

function getGenerationChannel(): BroadcastChannel {
  if (!generationChannel) {
    generationChannel = new BroadcastChannel("quiz-generation");
  }
  return generationChannel;
}

class GenerationService {
  /**
   * Start a new quiz generation with incremental saving.
   * Creates the session immediately and saves each batch to IDB.
   * Returns the sessionId right away.
   */
  async generateWithIncrementalSave(options: {
    type: "practice" | "exam";
    domain?: Domain;
    domains?: Domain[];
    countPerDomain?: number;
    totalCount: number;
    difficulty?: "easy" | "medium" | "hard";
    includeExplanations: boolean;
    timeLimit?: number;
    examType?: "full" | "domain";
    taskId?: string;
  }): Promise<string> {
    const sessionId = `${options.type}-${Date.now()}`;
    const settings = await storageService.getSettings();
    const batchSize = settings?.batchSize || 10;

    // For practice or domain exam: batches based on totalCount
    // For full exam: batches = number of multi-domain groups
    const isMultiDomain = options.domains && options.domains.length > 1;
    const totalBatches = isMultiDomain
      ? Math.ceil(options.domains!.length / 3) // 3 domains per group
      : Math.ceil(options.totalCount / batchSize);

    // Create session with GENERATING status immediately
    const session: QuizSession = {
      id: sessionId,
      type: options.type,
      domain: options.domain,
      questions: [],
      userAnswers: {},
      currentIndex: 0,
      status: QuizSessionStatus.GENERATING,
      startedAt: new Date(),
      timeLimit: options.timeLimit,
      generationProgress: {
        requestedCount: options.totalCount,
        completedBatches: 0,
        totalBatches,
        isGenerating: true,
      },
    };

    await indexedDBService.saveSession(session);
    console.log("[GenerationService] Created GENERATING session:", sessionId);

    return sessionId;
  }

  /**
   * Run the actual batch generation loop for a single-domain request.
   * Call this after generateWithIncrementalSave().
   */
  async runSingleDomainGeneration(
    sessionId: string,
    domain: Domain,
    totalCount: number,
    callbacks: GenerationCallbacks,
    options?: {
      difficulty?: "easy" | "medium" | "hard";
      taskId?: string;
    }
  ): Promise<void> {
    const settings = await storageService.getSettings();
    const batchSize = settings?.batchSize || 10;
    const totalBatches = Math.ceil(totalCount / batchSize);
    const aiService = aiServiceFactory.getService(settings.provider);

    let previousQuestions: string[] = [];

    // Load any existing questions (for resume)
    const existingSession = await indexedDBService.getSession(sessionId);
    if (existingSession && existingSession.questions.length > 0) {
      previousQuestions = existingSession.questions.map(q => q.question);
    }

    const startBatch = existingSession?.generationProgress?.completedBatches || 0;

    for (let batchIndex = startBatch; batchIndex < totalBatches; batchIndex++) {
      try {
        const batchCount = Math.min(batchSize, totalCount - batchIndex * batchSize);

        console.log(
          `[GenerationService] Batch ${batchIndex + 1}/${totalBatches} (${batchCount} questions)`
        );

        // Generate a single batch
        const batchQuestions = await aiService.generateQuestions({
          domain,
          count: batchCount,
          difficulty: options?.difficulty,
          includeExplanations: true,
          previousQuestions:
            previousQuestions.length > 0 ? previousQuestions : undefined,
        });

        // Append to session in IDB
        previousQuestions.push(...batchQuestions.map(q => q.question));

        const updatedSession = await indexedDBService.appendQuestionsToSession(
          sessionId,
          batchQuestions,
          {
            requestedCount: totalCount,
            completedBatches: batchIndex + 1,
            totalBatches,
            isGenerating: batchIndex < totalBatches - 1,
            lastBatchAt: new Date(),
          }
        );

        // Notify via BroadcastChannel
        try {
          getGenerationChannel().postMessage({
            type: "BATCH_COMPLETE",
            sessionId,
            currentCount: updatedSession?.questions.length || 0,
            totalCount,
          });
        } catch {
          // BroadcastChannel might not be available
        }

        // Callbacks
        callbacks.onBatchComplete?.({
          current: updatedSession?.questions.length || batchQuestions.length,
          total: totalCount,
          batch: batchQuestions,
          batchIndex,
          totalBatches,
        });

        // After first batch: session is ready for display
        if (batchIndex === 0) {
          callbacks.onSessionReady?.(sessionId);
          // Stop here - the quiz page will continue generation.
          // Navigating away kills this page's JS, so continuing is pointless.
          return;
        }
      } catch (error: any) {
        console.error(
          `[GenerationService] Batch ${batchIndex + 1} FAILED:`,
          error
        );

        // Save error state but keep existing questions
        const currentSession = await indexedDBService.getSession(sessionId);
        if (currentSession) {
          await indexedDBService.appendQuestionsToSession(sessionId, [], {
            requestedCount: totalCount,
            completedBatches: batchIndex,
            totalBatches,
            isGenerating: false,
            lastBatchAt: new Date(),
            generationError: error.message || "Erreur inconnue",
          });
        }

        // Update background task
        if (options?.taskId) {
          await notificationService.updateTaskStatus(
            options.taskId,
            "failed",
            undefined,
            error.message || "Erreur inconnue"
          );
        }

        callbacks.onGenerationError?.(
          {
            message: error.message || "Erreur inconnue",
            code: error.code,
            isRetryable: error.isRetryable ?? true,
          },
          sessionId,
          currentSession?.questions.length || 0,
          totalCount
        );

        return; // Stop generation, but questions are saved
      }
    }

    // All batches complete - finalize session
    await this.finalizeSession(sessionId, callbacks, options?.taskId);
  }

  /**
   * Run the generation loop for a full exam (multi-domain groups).
   */
  async runMultiDomainGeneration(
    sessionId: string,
    domains: Domain[],
    countPerDomain: number,
    callbacks: GenerationCallbacks,
    options?: {
      taskId?: string;
    }
  ): Promise<void> {
    const settings = await storageService.getSettings();
    const aiService = aiServiceFactory.getService(settings.provider);
    const totalCount = domains.length * countPerDomain;

    // Group domains into batches of 3 (same pattern as current exam page)
    const groups: Domain[][] = [];
    for (let i = 0; i < domains.length; i += 3) {
      groups.push(domains.slice(i, i + 3));
    }

    const totalBatches = groups.length;
    const startBatch = (await indexedDBService.getSession(sessionId))
      ?.generationProgress?.completedBatches || 0;

    let previousQuestions: string[] = [];
    const existingSession = await indexedDBService.getSession(sessionId);
    if (existingSession && existingSession.questions.length > 0) {
      previousQuestions = existingSession.questions.map(q => q.question);
    }

    for (let batchIndex = startBatch; batchIndex < totalBatches; batchIndex++) {
      const group = groups[batchIndex];

      try {
        console.log(
          `[GenerationService] Multi-domain group ${batchIndex + 1}/${totalBatches}`,
          group.map(d => d.replace(/_/g, " "))
        );

        const batchQuestions = await aiService.generateMultiDomainQuestions({
          domains: group,
          countPerDomain,
          includeExplanations: true,
          previousQuestions:
            previousQuestions.length > 0 ? previousQuestions : undefined,
        });

        previousQuestions.push(...batchQuestions.map(q => q.question));

        const updatedSession = await indexedDBService.appendQuestionsToSession(
          sessionId,
          batchQuestions,
          {
            requestedCount: totalCount,
            completedBatches: batchIndex + 1,
            totalBatches,
            isGenerating: batchIndex < totalBatches - 1,
            lastBatchAt: new Date(),
          }
        );

        try {
          getGenerationChannel().postMessage({
            type: "BATCH_COMPLETE",
            sessionId,
            currentCount: updatedSession?.questions.length || 0,
            totalCount,
          });
        } catch {
          // BroadcastChannel might not be available
        }

        callbacks.onBatchComplete?.({
          current: updatedSession?.questions.length || batchQuestions.length,
          total: totalCount,
          batch: batchQuestions,
          batchIndex,
          totalBatches,
        });

        if (batchIndex === 0) {
          callbacks.onSessionReady?.(sessionId);
          // Stop here - the quiz page will continue generation.
          return;
        }
      } catch (error: any) {
        console.error(
          `[GenerationService] Multi-domain group ${batchIndex + 1} FAILED:`,
          error
        );

        const currentSession = await indexedDBService.getSession(sessionId);
        if (currentSession) {
          await indexedDBService.appendQuestionsToSession(sessionId, [], {
            requestedCount: totalCount,
            completedBatches: batchIndex,
            totalBatches,
            isGenerating: false,
            lastBatchAt: new Date(),
            generationError: error.message || "Erreur inconnue",
          });
        }

        if (options?.taskId) {
          await notificationService.updateTaskStatus(
            options.taskId,
            "failed",
            undefined,
            error.message || "Erreur inconnue"
          );
        }

        callbacks.onGenerationError?.(
          {
            message: error.message || "Erreur inconnue",
            code: error.code,
            isRetryable: error.isRetryable ?? true,
          },
          sessionId,
          currentSession?.questions.length || 0,
          totalCount
        );

        return;
      }
    }

    await this.finalizeSession(sessionId, callbacks, options?.taskId);
  }

  /**
   * Finalize a session after successful generation.
   * Saves as SavedPracticeQuiz/SavedExam and updates status.
   */
  private async finalizeSession(
    sessionId: string,
    callbacks: GenerationCallbacks,
    taskId?: string
  ): Promise<void> {
    const session = await indexedDBService.getSession(sessionId);
    if (!session) return;

    // Update session status to IN_PROGRESS
    const finalized: QuizSession = {
      ...session,
      status: QuizSessionStatus.IN_PROGRESS,
      generationProgress: {
        ...session.generationProgress!,
        isGenerating: false,
      },
    };
    await indexedDBService.saveSession(finalized);

    // Save as SavedPracticeQuiz for reuse (or update existing one)
    if (session.type === "practice" && session.domain) {
      if (session.practiceQuizId) {
        // Update existing quiz (created when generation started)
        const existingQuiz = await indexedDBService.getPracticeQuiz(session.practiceQuizId);
        if (existingQuiz) {
          await indexedDBService.savePracticeQuiz({
            ...existingQuiz,
            questionCount: session.questions.length,
            questions: session.questions,
          });
          console.log("[Generation] Updated practice quiz:", session.practiceQuizId, "→", session.questions.length, "questions");
        }
      } else {
        // No existing quiz — create one (shouldn't normally happen)
        const quizId = `practice-${session.domain}-${Date.now()}`;
        const savedQuiz: SavedPracticeQuiz = {
          id: quizId,
          domain: session.domain,
          questionCount: session.questions.length,
          questions: session.questions,
          attempts: 1,
          createdAt: new Date(),
          lastAttemptAt: new Date(),
        };
        await indexedDBService.savePracticeQuiz(savedQuiz);

        // Link session to quiz
        await indexedDBService.saveSession({
          ...finalized,
          practiceQuizId: quizId,
        });
      }
    }

    // Save as SavedExam for reuse (if exam type)
    if (session.type === "exam") {
      const examId = `exam-${session.timeLimit === 7200 ? "full" : "domain"}-${Date.now()}`;
      const examName = session.domain
        ? `Examen ${session.domain.replace(/_/g, " ")}`
        : "Examen Complet";

      const savedExam: SavedExam = {
        id: examId,
        name: examName,
        type: session.timeLimit === 7200 ? "full" : "domain",
        domain: session.domain,
        questions: session.questions,
        attempts: [],
        bestScore: 0,
        bestAttemptId: "",
        createdAt: new Date(),
        lastAttemptAt: new Date(),
      };
      await indexedDBService.saveExam(savedExam);

      await indexedDBService.saveSession({
        ...finalized,
        examId,
      });
    }

    // Update background task
    if (taskId) {
      await notificationService.updateTaskStatus(taskId, "ready", sessionId);
    }

    // Notify quiz page
    try {
      getGenerationChannel().postMessage({
        type: "GENERATION_COMPLETE",
        sessionId,
      });
    } catch {
      // ignore
    }

    callbacks.onGenerationComplete?.(sessionId);
    console.log("[GenerationService] Generation complete:", sessionId);
  }

  /**
   * Finalize a session as partial (use available questions only).
   * Used when the user wants to start with what they have after an error.
   */
  async finalizeAsPartial(sessionId: string): Promise<QuizSession | undefined> {
    const session = await indexedDBService.getSession(sessionId);
    if (!session) return undefined;

    const finalized: QuizSession = {
      ...session,
      status: QuizSessionStatus.IN_PROGRESS,
      generationProgress: {
        ...session.generationProgress!,
        isGenerating: false,
      },
    };
    await indexedDBService.saveSession(finalized);

    // Save/update SavedPracticeQuiz
    if (session.type === "practice" && session.domain) {
      if (session.practiceQuizId) {
        // Update existing quiz
        const existingQuiz = await indexedDBService.getPracticeQuiz(session.practiceQuizId);
        if (existingQuiz) {
          await indexedDBService.savePracticeQuiz({
            ...existingQuiz,
            questionCount: session.questions.length,
            questions: session.questions,
          });
        }
      } else {
        // No existing quiz — create one
        const quizId = `practice-${session.domain}-partial-${Date.now()}`;
        const savedQuiz: SavedPracticeQuiz = {
          id: quizId,
          domain: session.domain,
          questionCount: session.questions.length,
          questions: session.questions,
          attempts: 1,
          createdAt: new Date(),
          lastAttemptAt: new Date(),
        };
        await indexedDBService.savePracticeQuiz(savedQuiz);

        await indexedDBService.saveSession({
          ...finalized,
          practiceQuizId: quizId,
        });
      }
    }

    // Save as partial SavedExam
    if (session.type === "exam") {
      const examId = `exam-partial-${Date.now()}`;
      const examName = session.domain
        ? `Examen ${session.domain.replace(/_/g, " ")} (partiel)`
        : "Examen Complet (partiel)";

      const savedExam: SavedExam = {
        id: examId,
        name: examName,
        type: session.timeLimit === 7200 ? "full" : "domain",
        domain: session.domain,
        questions: session.questions,
        attempts: [],
        bestScore: 0,
        bestAttemptId: "",
        createdAt: new Date(),
        lastAttemptAt: new Date(),
      };
      await indexedDBService.saveExam(savedExam);

      await indexedDBService.saveSession({
        ...finalized,
        examId,
      });
    }

    console.log(
      "[GenerationService] Finalized as partial:",
      sessionId,
      `(${session.questions.length} questions)`
    );

    return finalized;
  }

  /**
   * Resume an interrupted generation.
   * Continues from the last completed batch.
   */
  async resumeGeneration(
    sessionId: string,
    callbacks: GenerationCallbacks,
    options?: { taskId?: string }
  ): Promise<void> {
    const session = await indexedDBService.getSession(sessionId);
    if (!session || !session.generationProgress) {
      throw new Error("Session not found or has no generation progress");
    }

    // Reset the error and isGenerating flag
    await indexedDBService.appendQuestionsToSession(sessionId, [], {
      ...session.generationProgress,
      isGenerating: true,
      generationError: undefined,
    });

    if (session.type === "practice" && session.domain) {
      await this.runSingleDomainGeneration(
        sessionId,
        session.domain,
        session.generationProgress.requestedCount,
        callbacks,
        { taskId: options?.taskId }
      );
    } else if (session.type === "exam" && session.generationProgress.requestedCount > 20) {
      // Full exam - resume multi-domain
      const allDomains = Object.values(Domain);
      await this.runMultiDomainGeneration(
        sessionId,
        allDomains,
        4,
        callbacks,
        { taskId: options?.taskId }
      );
    } else if (session.type === "exam" && session.domain) {
      // Domain exam
      await this.runSingleDomainGeneration(
        sessionId,
        session.domain,
        session.generationProgress.requestedCount,
        callbacks,
        { taskId: options?.taskId }
      );
    }
  }

  /**
   * Find sessions with interrupted generations.
   * Checks both GENERATING status and IN_PROGRESS sessions where isGenerating is still true.
   * Also finds sessions with generation errors.
   */
  async findInterruptedGenerations(): Promise<QuizSession[]> {
    const allSessions = await indexedDBService.getAllSessions();
    return allSessions.filter(s => {
      // Only show sessions that are actively generating (not paused/completed)
      if (s.status === "COMPLETED" || s.status === "PAUSED") return false;
      return s.generationProgress?.isGenerating === true ||
        (s.generationProgress?.generationError != null);
    });
  }
}

// Singleton instance
export const generationService = new GenerationService();
