"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { QuestionCard, QuestionValue, emptyQuestionValue } from "@/components/features/QuestionCard";
import { QuizTimer } from "@/components/features/QuizTimer";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import {
  Question,
  QuizSession,
  QuizSessionStatus,
  GenerationState,
  Domain,
  UserAnswer,
  QuestionType,
} from "@/types";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Grid3x3,
  X,
  Loader2,
} from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { generationService } from "@/services/GenerationService";
import { statisticsService } from "@/services/StatisticsService";
import { mistakesService } from "@/services/MistakesService";
import { dailyStatsService } from "@/services/DailyStatsService";
import {
  areChoicesCorrect,
  areBlanksCorrect,
  getQuestionScore,
} from "@/lib/questionCheck";

// ============================================
// QUIZ PAGE
// Moteur de quiz : affiche une question à la fois.
// Gère tous les formats (QCM simple/multi, V/F,
// trous, code, cas pratique), la reprise de session,
// la génération IA progressive, le cahier d'erreurs
// et les stats quotidiennes.
// ============================================

function isExamLike(type: string): boolean {
  return type === "exam";
}

function hasAnswer(q: Question, v: QuestionValue | undefined): boolean {
  if (!v) return false;
  switch (q.type) {
    case QuestionType.FILL_BLANK:
      return (q.blanks || []).every((_, i) => (v.textAnswers[i] || "").trim().length > 0);
    case QuestionType.CASE_STUDY:
      return v.corrigeRevealed === true;
    case QuestionType.CODE:
      return v.codeResult !== undefined && v.codeResult !== null;
    default:
      return v.selectedIds.length > 0;
  }
}

function isValueCorrect(q: Question, v: QuestionValue | undefined): boolean {
  if (!v) return false;
  switch (q.type) {
    case QuestionType.FILL_BLANK:
      return areBlanksCorrect(q, v.textAnswers);
    case QuestionType.CODE: {
      const tests = v.codeResult?.tests || [];
      return tests.length > 0 && tests.every((t) => t.passed);
    }
    case QuestionType.CASE_STUDY: {
      const checked = v.rubricChecked || [];
      const subs = q.subQuestions || [];
      if (subs.length === 0) return false;
      const totalPoints = subs.reduce((acc, s) => acc + s.rubric.length, 0);
      if (totalPoints === 0) return false;
      const earned = subs.reduce(
        (acc, s, i) => acc + s.rubric.filter((_, j) => checked[i]?.[j]).length,
        0
      );
      return earned / totalPoints >= 0.7;
    }
    default:
      return areChoicesCorrect(q, v.selectedIds);
  }
}

function toUserAnswer(
  q: Question,
  v: QuestionValue,
  timeSpent: number,
  isFavorite: boolean
): UserAnswer {
  const correct = isValueCorrect(q, v);
  const codeScore =
    q.type === QuestionType.CODE && v.codeResult?.tests
      ? v.codeResult.tests.filter((t) => t.passed).length / v.codeResult.tests.length
      : undefined;
  const selfScore =
    q.type === QuestionType.CASE_STUDY
      ? (() => {
          const subs = q.subQuestions || [];
          const total = subs.reduce((acc, s) => acc + s.rubric.length, 0);
          const earned = subs.reduce(
            (acc, s, i) => acc + s.rubric.filter((_, j) => v.rubricChecked?.[i]?.[j]).length,
            0
          );
          return total === 0 ? 0 : earned / total;
        })()
      : undefined;

  return {
    questionId: q.id,
    selectedAnswerIds: v.selectedIds,
    isCorrect: correct,
    timeSpent,
    isFavorite,
    textAnswers: v.textAnswers.length > 0 ? v.textAnswers : undefined,
    codeAnswer: v.codeAnswer,
    codeScore,
    selfScore,
    rubricChecked: v.rubricChecked,
  };
}

function valueFromUserAnswer(ua: UserAnswer): QuestionValue {
  return {
    ...emptyQuestionValue(),
    selectedIds: ua.selectedAnswerIds || [],
    textAnswers: ua.textAnswers || [],
    codeAnswer: ua.codeAnswer,
    rubricChecked: ua.rubricChecked,
  };
}

function QuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [values, setValues] = useState<Record<string, QuestionValue>>({});
  const [validated, setValidated] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [sessionType, setSessionType] = useState<string>("practice");
  const [sessionLabel, setSessionLabel] = useState<string>("");
  const [timeLimit, setTimeLimit] = useState<number | undefined>();
  const [timerInitialTime, setTimerInitialTime] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuickNav, setShowQuickNav] = useState(false);

  // Progressive generation state (mode IA uniquement)
  const [generationState, setGenerationState] = useState<GenerationState | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTimeRef = useRef<number>(0);
  const timeSpentRef = useRef<Record<string, number>>({});
  const questionEnterRef = useRef<number>(Date.now());
  const currentIndexRef = useRef(0);

  const examMode = isExamLike(sessionType);
  const currentQuestion = questions[currentIndex];
  const currentValue = currentQuestion ? values[currentQuestion.id] || emptyQuestionValue() : emptyQuestionValue();
  const showResult = validated.has(currentQuestion?.id || "");
  const progress =
    questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const patchValue = (patch: Partial<QuestionValue>) => {
    if (!currentQuestion) return;
    setValues((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...(prev[currentQuestion.id] || emptyQuestionValue()), ...patch },
    }));
  };

  // Compte le temps passé sur la question courante
  const flushQuestionTime = () => {
    const q = questions[currentIndexRef.current];
    if (!q) return;
    const elapsed = Math.floor((Date.now() - questionEnterRef.current) / 1000);
    timeSpentRef.current[q.id] = (timeSpentRef.current[q.id] || 0) + Math.min(elapsed, 600);
    questionEnterRef.current = Date.now();
  };

  // Load session on mount
  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) {
        setError("Aucune session trouvée. Veuillez commencer un nouveau quiz.");
        setLoading(false);
        return;
      }

      try {
        await indexedDBService.init();
        const session = await indexedDBService.getSession(sessionId);

        if (!session) {
          setError("Session introuvable. Veuillez recommencer.");
          setLoading(false);
          return;
        }

        setQuestions(session.questions);
        setCurrentIndexSafe(session.currentIndex);
        setCurrentIndex(session.currentIndex);
        setSessionType(session.type);
        setSessionLabel(session.label || "");
        if (session.type === "exam") {
          setTimerInitialTime(session.timeRemaining || session.timeLimit || 0);
          setTimeLimit(session.timeLimit);
        } else {
          setTimerInitialTime(session.timeRemaining || 0);
          setTimeLimit(undefined);
        }

        if (session.status === QuizSessionStatus.COMPLETED) {
          setQuizCompleted(true);
        }

        // Reprise de génération IA (inchangé, mode IA uniquement)
        if (
          session.generationProgress?.isGenerating ||
          session.status === QuizSessionStatus.GENERATING
        ) {
          setTimeout(async () => {
            try {
              const fresh = await indexedDBService.getSession(sessionId);
              if (!fresh || fresh.status === "PAUSED" || fresh.status === "COMPLETED") {
                return;
              }

              setGenerationState({
                isGenerating: true,
                availableCount: fresh.questions.length,
                requestedCount:
                  fresh.generationProgress?.requestedCount || fresh.questions.length,
              });

              if (fresh.status === QuizSessionStatus.GENERATING) {
                await indexedDBService.saveSession({
                  ...fresh,
                  status: QuizSessionStatus.IN_PROGRESS,
                });
              }
            } catch {}
          }, 500);
        }

        // Restaure les réponses existantes
        if (session.userAnswers) {
          const restored: Record<string, QuestionValue> = {};
          const answeredIds = new Set<string>();
          Object.values(session.userAnswers).forEach((ua) => {
            restored[ua.questionId] = valueFromUserAnswer(ua);
            if (
              (ua.selectedAnswerIds && ua.selectedAnswerIds.length > 0) ||
              (ua.textAnswers && ua.textAnswers.length > 0) ||
              ua.codeAnswer
            ) {
              answeredIds.add(ua.questionId);
            }
          });
          setValues(restored);
          // En pratique, une question déjà répondue reste validée (corrigé visible)
          if (session.type !== "exam") {
            setValidated(answeredIds);
          }
        }

        const allFavorites = await indexedDBService.getAllFavorites();
        setFavorites(new Set(allFavorites.map((q) => q.id)));

        setLoading(false);
      } catch (err) {
        console.error("Failed to load session:", err);
        setError("Erreur lors du chargement de la session.");
        setLoading(false);
      }
    };

    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const setCurrentIndexSafe = (index: number) => {
    currentIndexRef.current = index;
    questionEnterRef.current = Date.now();
  };

  // Listen for new questions via BroadcastChannel (génération IA)
  useEffect(() => {
    if (!sessionId) return;

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("quiz-generation");
    } catch {
      // BroadcastChannel not supported, polling will handle it
    }

    const handler = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.sessionId !== sessionId) return;

      if (data.type === "BATCH_COMPLETE") {
        try {
          const session = await indexedDBService.getSession(sessionId);
          if (session) {
            setQuestions([...session.questions]);
            setGenerationState((prev) =>
              prev ? { ...prev, availableCount: session.questions.length } : null
            );
          }
        } catch (err) {
          console.error("[Quiz] Failed to reload session:", err);
        }
      }

      if (data.type === "GENERATION_COMPLETE") {
        try {
          const session = await indexedDBService.getSession(sessionId);
          if (session) {
            setQuestions([...session.questions]);
          }
        } catch {
          // ignore
        }
        setGenerationState(null);
      }
    };

    if (channel) {
      channel.addEventListener("message", handler);
    }

    return () => {
      if (channel) {
        channel.removeEventListener("message", handler);
        channel.close();
      }
    };
  }, [sessionId]);

  // Continue la génération IA si nécessaire
  useEffect(() => {
    if (!generationState?.isGenerating || !sessionId) return;

    let cancelled = false;

    const continueGeneration = async () => {
      try {
        const session = await indexedDBService.getSession(sessionId);
        if (!session || !session.generationProgress || cancelled) return;
        if (session.status === "PAUSED" || session.status === "COMPLETED") return;

        const gp = session.generationProgress;
        if (!gp.isGenerating || gp.completedBatches >= gp.totalBatches) return;

        if (session.type === "exam" && !session.domain && gp.requestedCount > 20) {
          const allDomains = Object.values(Domain);
          await generationService.runMultiDomainGeneration(sessionId, allDomains, 4, {
            onBatchComplete: async () => {
              if (cancelled) return;
              const s = await indexedDBService.getSession(sessionId);
              if (s) {
                setQuestions([...s.questions]);
                setGenerationState((prev) =>
                  prev ? { ...prev, availableCount: s.questions.length } : null
                );
              }
            },
            onGenerationComplete: () => {
              if (cancelled) return;
              setGenerationState(null);
            },
            onGenerationError: () => {
              if (cancelled) return;
              setGenerationState(null);
            },
          });
        } else if (session.domain) {
          await generationService.runSingleDomainGeneration(
            sessionId,
            session.domain,
            gp.requestedCount,
            {
              onBatchComplete: async () => {
                if (cancelled) return;
                const s = await indexedDBService.getSession(sessionId);
                if (s) {
                  setQuestions([...s.questions]);
                  setGenerationState((prev) =>
                    prev ? { ...prev, availableCount: s.questions.length } : null
                  );
                }
              },
              onGenerationComplete: () => {
                if (cancelled) return;
                setGenerationState(null);
              },
              onGenerationError: () => {
                if (cancelled) return;
                setGenerationState(null);
              },
            }
          );
        }
      } catch (err) {
        console.error("[Quiz] Failed to continue generation:", err);
        if (!cancelled) setGenerationState(null);
      }
    };

    continueGeneration();

    return () => {
      cancelled = true;
    };
  }, [generationState?.isGenerating, sessionId]);

  // Polling fallback (génération IA)
  useEffect(() => {
    if (!generationState?.isGenerating || !sessionId) return;

    pollingRef.current = setInterval(async () => {
      try {
        const session = await indexedDBService.getSession(sessionId);
        if (!session) return;

        const newCount = session.questions.length;
        if (newCount !== questions.length) {
          setQuestions([...session.questions]);
          setGenerationState((prev) =>
            prev ? { ...prev, availableCount: newCount } : null
          );
        }

        if (!session.generationProgress?.isGenerating) {
          setGenerationState(null);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      } catch (err) {
        console.error("[Quiz] Polling error:", err);
      }
    }, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [generationState?.isGenerating, sessionId, questions.length]);

  // Save session progress (answers + index + temps)
  const buildUserAnswers = (): Record<string, UserAnswer> => {
    const userAnswers: Record<string, UserAnswer> = {};
    questions.forEach((q) => {
      const v = values[q.id];
      if (hasAnswer(q, v)) {
        userAnswers[q.id] = toUserAnswer(
          q,
          v,
          timeSpentRef.current[q.id] || 0,
          favorites.has(q.id)
        );
      }
    });
    return userAnswers;
  };

  const saveSessionProgress = async () => {
    if (!sessionId) return;
    try {
      const session = await indexedDBService.getSession(sessionId);
      if (session) {
        await indexedDBService.saveSession({
          ...session,
          currentIndex,
          userAnswers: buildUserAnswers(),
          timeRemaining: currentTimeRef.current || undefined,
        });
      }
    } catch (err) {
      console.error("Failed to save session progress:", err);
    }
  };

  useEffect(() => {
    if (!loading && questions.length > 0) {
      saveSessionProgress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, values]);

  // Update SavedPracticeQuiz when questions arrive from background generation
  useEffect(() => {
    const updatePracticeQuiz = async () => {
      if (!sessionId || loading || questions.length === 0) return;
      try {
        const session = await indexedDBService.getSession(sessionId);
        if (session?.type === "practice" && session.practiceQuizId) {
          const quiz = await indexedDBService.getPracticeQuiz(session.practiceQuizId);
          if (quiz && quiz.questions.length !== questions.length) {
            await indexedDBService.savePracticeQuiz({
              ...quiz,
              questionCount: questions.length,
              questions: questions,
            });
          }
        }
      } catch {}
    };
    updatePracticeQuiz();
  }, [questions.length, sessionId, loading]);

  // Pause la session en quittant le quiz
  useEffect(() => {
    const pauseSession = async () => {
      if (!sessionId) return;
      try {
        const session = await indexedDBService.getSession(sessionId);
        if (!session) return;

        if (session.status === "IN_PROGRESS" || session.status === "GENERATING") {
          await indexedDBService.saveSession({
            ...session,
            status: "PAUSED" as any,
            generationProgress: session.generationProgress
              ? { ...session.generationProgress, isGenerating: false }
              : undefined,
            userAnswers: buildUserAnswers(),
          });
        }

        if (
          session.type === "practice" &&
          session.practiceQuizId &&
          session.questions.length > 0 &&
          session.domain
        ) {
          const existingQuiz = await indexedDBService.getPracticeQuiz(session.practiceQuizId);
          if (existingQuiz && existingQuiz.questions.length !== session.questions.length) {
            await indexedDBService.savePracticeQuiz({
              ...existingQuiz,
              questionCount: session.questions.length,
              questions: session.questions,
            });
          }
        }
      } catch {}
    };

    return () => {
      pauseSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const handleGoToQuestion = (index: number) => {
    flushQuestionTime();
    currentIndexRef.current = index;
    setCurrentIndex(index);
    setShowQuickNav(false);
  };

  const handleNext = () => {
    flushQuestionTime();
    if (currentIndex < questions.length - 1) {
      setCurrentIndexSafe(currentIndex + 1);
      setCurrentIndex(currentIndex + 1);
    } else {
      if (generationState?.isGenerating) {
        return;
      }
      flushQuestionTime();
      setQuizCompleted(true);
    }
  };

  const handlePrevious = () => {
    flushQuestionTime();
    if (currentIndex > 0) {
      setCurrentIndexSafe(currentIndex - 1);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleToggleFavorite = async () => {
    if (!currentQuestion) return;

    const newFavorites = new Set(favorites);
    if (newFavorites.has(currentQuestion.id)) {
      newFavorites.delete(currentQuestion.id);
      await indexedDBService.removeFavorite(currentQuestion.id);
    } else {
      newFavorites.add(currentQuestion.id);
      // On sauvegarde la question SANS réponse présélectionnée :
      // les favoris doivent rester un outil de révision, pas un corrigé.
      await indexedDBService.addFavorite(currentQuestion);
    }
    setFavorites(newFavorites);
  };

  const handleValidate = () => {
    if (!currentQuestion) return;
    setValidated((prev) => new Set(prev).add(currentQuestion.id));
  };

  // Le bouton central : Valider (pratique) ou Suivant (examen)
  const handleValidateOrNext = () => {
    if (examMode) {
      handleNext();
      return;
    }
    if (showResult) {
      handleNext();
    } else {
      handleValidate();
    }
  };

  // Peut-on valider la question courante ?
  const canValidateCurrent = (() => {
    if (!currentQuestion || showResult) return false;
    switch (currentQuestion.type) {
      case QuestionType.FILL_BLANK:
        return (currentQuestion.blanks || []).every(
          (_, i) => (currentValue.textAnswers[i] || "").trim().length > 0
        );
      case QuestionType.CASE_STUDY:
        return currentValue.corrigeRevealed === true;
      case QuestionType.CODE:
        return currentValue.codeResult !== undefined && currentValue.codeResult !== null;
      default:
        return currentValue.selectedIds.length > 0;
    }
  })();

  // Score cohérent : toujours divisé par le TOTAL de questions
  const computeScore = () => {
    let passed = 0;
    questions.forEach((q) => {
      if (isValueCorrect(q, values[q.id])) passed++;
    });
    return {
      score: questions.length > 0 ? Math.round((passed / questions.length) * 100) : 0,
      passed,
      answered: questions.filter((q) => hasAnswer(q, values[q.id])).length,
    };
  };

  // Save completion and update statistics when quiz is completed
  useEffect(() => {
    const handleQuizCompletion = async () => {
      if (quizCompleted && sessionId) {
        try {
          const session = await indexedDBService.getSession(sessionId);
          if (!session) return;

          const userAnswers = buildUserAnswers();
          const completedSession: QuizSession = {
            ...session,
            userAnswers,
            status: QuizSessionStatus.COMPLETED,
            completedAt: new Date(),
          };
          await indexedDBService.saveSession(completedSession);

          // Statistics (globales)
          await statisticsService.init();
          await statisticsService.updateFromSession(completedSession);

          // Cahier d'erreurs : seulement les questions réellement tentées
          const results = questions
            .filter((q) => userAnswers[q.id])
            .map((q) => ({ questionId: q.id, correct: userAnswers[q.id].isCorrect }));
          await mistakesService.recordSession(questions, results);

          // Activité du jour (streak / objectif)
          const correctCount = results.filter((r) => r.correct).length;
          const timeSpent = completedSession.completedAt
            ? Math.floor(
                (new Date(completedSession.completedAt).getTime() -
                  new Date(session.startedAt).getTime()) /
                  1000
              )
            : 0;
          await dailyStatsService.recordActivity(results.length, correctCount, timeSpent);

          // Tentative d'examen
          if (session.type === "exam" && session.examId) {
            await saveExamAttempt(completedSession, session.examId);
          }

          // Meilleur score du quiz de pratique
          if (session.type === "practice" && session.practiceQuizId) {
            const quiz = await indexedDBService.getPracticeQuiz(session.practiceQuizId);
            if (quiz) {
              const score = questions.length
                ? Math.round((correctCount / questions.length) * 100)
                : 0;
              await indexedDBService.savePracticeQuiz({
                ...quiz,
                bestScore: Math.max(quiz.bestScore || 0, score),
                attempts: quiz.attempts + 1,
                lastAttemptAt: new Date(),
              });
            }
          }
        } catch (error) {
          console.error("[Quiz] Failed to update session/statistics:", error);
        }
      }
    };

    handleQuizCompletion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizCompleted, sessionId]);

  const saveExamAttempt = async (completedSession: QuizSession, examId: string) => {
    try {
      const exam = await indexedDBService.getExam(examId);
      if (!exam) return;

      // Score cohérent : divisé par le total, non répondu = faux
      const total = completedSession.questions?.length || 0;
      const correct = (completedSession.questions || []).filter(
        (q) => completedSession.userAnswers?.[q.id]?.isCorrect
      ).length;
      const score = total > 0 ? Math.round((correct / total) * 100) : 0;

      const timeSpent = completedSession.completedAt
        ? Math.floor(
            (new Date(completedSession.completedAt).getTime() -
              new Date(completedSession.startedAt).getTime()) /
              1000
          )
        : 0;

      const attempt = {
        id: `attempt-${Date.now()}`,
        type: exam.type,
        domain: exam.domain,
        questions: completedSession.questions || [],
        userAnswers: completedSession.userAnswers || {},
        score,
        totalQuestions: total,
        correctAnswers: correct,
        startedAt: completedSession.startedAt,
        completedAt: completedSession.completedAt || new Date(),
        timeSpent,
      };

      const updatedAttempts = [...exam.attempts, attempt];
      const newBestScore = Math.max(exam.bestScore, score);
      const newBestAttemptId = score > exam.bestScore ? attempt.id : exam.bestAttemptId;

      await indexedDBService.saveExam({
        ...exam,
        attempts: updatedAttempts,
        bestScore: newBestScore,
        bestAttemptId: newBestAttemptId,
        lastAttemptAt: new Date(),
      });
    } catch (error) {
      console.error("[Quiz] Failed to save exam attempt:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement du quiz...</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardContent className="text-center py-12">
              <p className="text-domain-ml mb-4">{error}</p>
              <Button variant="primary" onClick={() => router.push("/")}>
                Retour à l&apos;Accueil
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (quizCompleted) {
    const { score, passed, answered } = computeScore();

    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
          <Card>
            <CardContent className="text-center py-12">
              <div className="mb-8">
                <h1 className="font-mono font-bold text-3xl mb-2">
                  {examMode ? "Examen Terminé !" : "Quiz Terminé !"}
                </h1>
                {sessionLabel && (
                  <p className="font-mono text-sm text-accent mb-1">{sessionLabel}</p>
                )}
                <p className="text-ink-secondary">Voici vos résultats</p>
              </div>

              <div className="mb-8">
                <div className="text-6xl font-mono font-bold text-accent mb-2">
                  {score}%
                </div>
                <p className="text-ink-muted">
                  {passed} / {questions.length} questions réussies
                  {answered < questions.length &&
                    ` • ${questions.length - answered} sans réponse (comptées fausses)`}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-8">
                <div className="p-4 bg-paper-secondary rounded">
                  <div className="font-mono text-xs text-ink-muted uppercase mb-1">
                    Erreurs ajoutées au cahier d&apos;erreurs
                  </div>
                  <div className="font-mono text-lg font-bold">
                    {questions.filter((q) => hasAnswer(q, values[q.id]) && !isValueCorrect(q, values[q.id])).length}
                  </div>
                </div>
              </div>

              {/* Review answers section */}
              <div className="text-left mb-8">
                <h2 className="font-mono font-semibold mb-4">Révision des réponses</h2>
                <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                  {questions.map((q, index) => {
                    const v = values[q.id];
                    const answeredQ = hasAnswer(q, v);
                    const isPassed = isValueCorrect(q, v);

                    return (
                      <div
                        key={q.id}
                        className="p-3 bg-paper-secondary rounded text-sm"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`font-mono font-bold ${
                              !answeredQ
                                ? "text-ink-muted"
                                : isPassed
                                  ? "text-domain-dl"
                                  : "text-domain-ml"
                            }`}
                          >
                            {index + 1}.
                          </span>
                          <div className="flex-1">
                            <p className="font-medium mb-1 line-clamp-2">{q.question}</p>
                            <p
                              className={`text-xs ${
                                !answeredQ
                                  ? "text-ink-muted"
                                  : isPassed
                                    ? "text-domain-dl"
                                    : "text-domain-ml"
                              }`}
                            >
                              {!answeredQ
                                ? "Sans réponse"
                                : isPassed
                                  ? "✓ Réussie"
                                  : "✗ Échouée"}
                              {q.type === QuestionType.CODE && answeredQ && (
                                <span className="ml-1">
                                  ({v.codeResult?.tests?.filter((t) => t.passed).length || 0}/
                                  {q.code?.tests.length || 0} tests)
                                </span>
                              )}
                              {q.type === QuestionType.CASE_STUDY && answeredQ && (
                                <span className="ml-1">
                                  ({Math.round(
                                    (getQuestionScore(q, {
                                      questionId: q.id,
                                      selectedAnswerIds: [],
                                      isCorrect: false,
                                      timeSpent: 0,
                                      isFavorite: false,
                                      rubricChecked: v.rubricChecked,
                                    }) *
                                      100)
                                  )} % auto-évalué)
                                </span>
                              )}
                            </p>
                            {!isPassed && answeredQ && q.type !== QuestionType.CASE_STUDY && (
                              <p className="text-xs text-domain-dl mt-1">
                                Bonne{q.type === QuestionType.MULTIPLE_CHOICE ? "s" : ""} réponse
                                {q.type === QuestionType.MULTIPLE_CHOICE ? "s" : ""} :{" "}
                                {q.answers
                                  .filter((a) => a.isCorrect)
                                  .map((a) => a.text)
                                  .join("  •  ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-4 justify-center">
                <Button variant="secondary" onClick={() => router.push("/")}>
                  Retour à l&apos;Accueil
                </Button>
                <Button
                  variant="primary"
                  onClick={() =>
                    router.push(examMode ? "/exam" : "/practice")
                  }
                >
                  {examMode ? "Autre Examen" : "Nouveau Quiz"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const answeredCount = questions.filter((q) => hasAnswer(q, values[q.id])).length;

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
        {/* Generation Progress Banner (mode IA) */}
        {generationState && generationState.isGenerating && (
          <div className="mb-4 p-3 bg-accent/10 border border-accent/30 rounded-lg">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-mono text-sm text-accent">
                    {generationState.availableCount} / {generationState.requestedCount}{" "}
                    questions
                  </p>
                  <span className="font-mono text-xs text-ink-muted">
                    {generationState.requestedCount - generationState.availableCount} en
                    cours...
                  </span>
                </div>
                <ProgressBar
                  value={
                    (generationState.availableCount / generationState.requestedCount) * 100
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="mb-4">
          {/* Mobile layout */}
          <div className="sm:hidden space-y-2">
            <div className="flex items-center justify-between">
              <h1 className="font-mono font-semibold text-sm flex-1">
                {examMode ? "Examen" : "Pratique"}
              </h1>
              <span className="font-mono text-xs text-ink-muted ml-2">
                {currentIndex + 1}/{questions.length}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.back()}
                  className="px-2 py-1"
                  title="Quitter"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowQuickNav(!showQuickNav)}
                  title="Navigation rapide"
                  className="px-2 py-1"
                >
                  <Grid3x3 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <QuizTimer
                initialTime={timerInitialTime}
                timeLimit={timeLimit}
                mode={examMode ? "countdown" : "countup"}
                isPaused={showResult}
                onTimeUp={() => setQuizCompleted(true)}
                onTimeUpdate={(t) => {
                  currentTimeRef.current = t;
                }}
                compact
              />
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden sm:block">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="min-w-0">
                  <h1 className="font-mono font-semibold text-base">
                    {examMode ? "Mode Examen" : "Mode Pratique"}
                  </h1>
                  <p className="font-mono text-xs text-ink-muted">
                    {sessionLabel && (
                      <span>{sessionLabel} • </span>
                    )}
                    Question {currentIndex + 1} / {questions.length}
                    <span>{` • ${answeredCount}/${questions.length} répondues`}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <QuizTimer
                  initialTime={timerInitialTime}
                  timeLimit={timeLimit}
                  mode={examMode ? "countdown" : "countup"}
                  isPaused={showResult}
                  onTimeUp={() => setQuizCompleted(true)}
                  onTimeUpdate={(t) => {
                    currentTimeRef.current = t;
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowQuickNav(!showQuickNav)}
                  title="Navigation rapide"
                >
                  <Grid3x3 className="w-4 h-4" />
                </Button>
                <Button variant="secondary" size="sm" onClick={() => router.back()}>
                  <ArrowLeft className="w-4 h-4" />
                  Quitter
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <ProgressBar value={progress} showLabel />
        </div>

        {/* Quick Navigation Grid */}
        {showQuickNav && (
          <Card className="mb-6 animate-fade-in-down">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-mono text-sm font-semibold">Navigation Rapide</h3>
                <Button variant="secondary" size="sm" onClick={() => setShowQuickNav(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                {questions.map((q, index) => {
                  const isAnswered = hasAnswer(q, values[q.id]);
                  const isCurrent = index === currentIndex;
                  // En examen, on NE révèle PAS la correction :
                  // seules les cases répondues/non répondues sont visibles.
                  const isPassed = !examMode && isAnswered && isValueCorrect(q, values[q.id]);
                  const isFailed = !examMode && isAnswered && !isValueCorrect(q, values[q.id]);

                  return (
                    <button
                      key={q.id}
                      onClick={() => handleGoToQuestion(index)}
                      className={`
                        w-10 h-10 rounded font-mono text-sm font-medium transition-all
                        ${
                          isCurrent
                            ? "bg-accent text-paper-primary ring-2 ring-accent"
                            : "bg-paper-secondary hover:bg-paper-dark"
                        }
                        ${
                          isAnswered && !isCurrent
                            ? isPassed
                              ? "bg-domain-dl/20 text-domain-dl border border-domain-dl"
                              : isFailed
                                ? "bg-domain-ml/20 text-domain-ml border border-domain-ml"
                                : examMode
                                  ? "bg-accent/10 text-ink-secondary border border-paper-dark"
                                  : ""
                            : ""
                        }
                      `}
                      title={`Question ${index + 1}${isAnswered ? " • Répondue" : ""}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-ink-muted">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-accent/10 border border-paper-dark"></div>
                  <span>Répondue</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-paper-secondary border border-paper-dark"></div>
                  <span>Non répondu</span>
                </div>
                {!examMode && (
                  <>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-domain-dl/20 border border-domain-dl"></div>
                      <span>Réussie</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded bg-domain-ml/20 border border-domain-ml"></div>
                      <span>Échouée</span>
                    </div>
                  </>
                )}
                {examMode && (
                  <span className="italic">
                    Correction masquée pendant l&apos;épreuve
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Question Card */}
        {currentQuestion && (
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            value={currentValue}
            onChange={patchValue}
            showResult={showResult}
            score={getQuestionScore(currentQuestion, {
              questionId: currentQuestion.id,
              selectedAnswerIds: currentValue.selectedIds,
              isCorrect: false,
              timeSpent: 0,
              isFavorite: false,
              textAnswers: currentValue.textAnswers,
              codeScore:
                currentValue.codeResult?.tests && currentValue.codeResult.tests.length > 0
                  ? currentValue.codeResult.tests.filter((t) => t.passed).length /
                    currentValue.codeResult.tests.length
                  : 0,
              rubricChecked: currentValue.rubricChecked,
            })}
            isFavorite={favorites.has(currentQuestion.id)}
            onToggleFavorite={handleToggleFavorite}
            questionNumber={currentIndex + 1}
          />
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <Button variant="secondary" onClick={handlePrevious} disabled={currentIndex === 0}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Précédent
          </Button>

          {examMode ? (
            <Button variant="primary" onClick={handleNext}>
              {currentIndex < questions.length - 1 ? (
                <>
                  Suivant
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              ) : generationState?.isGenerating ? (
                <>
                  En attente...
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                </>
              ) : (
                <>
                  Terminer l&apos;Examen
                  <CheckCircle className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          ) : showResult ? (
            <Button variant="primary" onClick={handleNext}>
              {currentIndex < questions.length - 1 ? (
                <>
                  Suivant
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              ) : generationState?.isGenerating ? (
                <>
                  En attente...
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                </>
              ) : (
                <>
                  Terminer
                  <CheckCircle className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            <Button variant="primary" onClick={handleValidateOrNext} disabled={!canValidateCurrent}>
              <CheckCircle className="w-4 h-4 mr-2" />
              {currentQuestion?.type === QuestionType.CASE_STUDY ? "Voir le corrigé" : "Valider"}
            </Button>
          )}
        </div>

        {examMode && answeredCount < questions.length && (
          <p className="text-center text-sm text-ink-muted mt-4">
            {questions.length - answeredCount} question
            {questions.length - answeredCount > 1 ? "s" : ""} non répondue
            {questions.length - answeredCount > 1 ? "s" : ""}
          </p>
        )}
      </main>
    </div>
  );
}

export default function QuizPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col bg-paper-primary">
          <Navigation />
          <main className="flex-1 flex items-center justify-center">
            <p className="font-mono text-ink-muted">Chargement du quiz...</p>
          </main>
        </div>
      }
    >
      <QuizContent />
    </Suspense>
  );
}
