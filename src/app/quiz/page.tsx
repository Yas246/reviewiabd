"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { QuestionCard } from "@/components/features/QuestionCard";
import { QuizTimer } from "@/components/features/QuizTimer";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Question, QuizSession, SavedExam, QuizSessionStatus } from "@/types";
import { ArrowLeft, ArrowRight, CheckCircle, Grid3x3, X } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { statisticsService } from "@/services/StatisticsService";

// ============================================
// QUIZ PAGE
// Display questions one at a time with timer
// ============================================

function QuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string>
  >({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showResult, setShowResult] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [sessionType, setSessionType] = useState<
    "practice" | "exam" | "offline"
  >("practice");
  const [timeLimit, setTimeLimit] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuickNav, setShowQuickNav] = useState(false);

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

        // Set state from session
        setQuestions(session.questions);
        setCurrentIndex(session.currentIndex);
        setSessionType(session.type as "practice" | "exam" | "offline");
        setTimeLimit(session.timeLimit);

        // Load user answers if they exist
        if (session.userAnswers) {
          const answers: Record<string, string> = {};
          Object.values(session.userAnswers).forEach((userAnswer) => {
            if (userAnswer.selectedAnswerIds && userAnswer.selectedAnswerIds[0]) {
              answers[userAnswer.questionId] = userAnswer.selectedAnswerIds[0];
            }
          });
          setSelectedAnswers(answers);
        }

        // Load favorites from IndexedDB
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
  }, [sessionId]);

  // Save session progress and answers
  const saveSessionProgress = async () => {
    if (!sessionId) return;

    try {
      const session = await indexedDBService.getSession(sessionId);
      if (session) {
        // Convert selectedAnswers to userAnswers format
        const userAnswers: Record<string, { questionId: string; selectedAnswerIds: string[]; isCorrect: boolean; timeSpent: number; isFavorite: boolean }> = {};
        Object.entries(selectedAnswers).forEach(([questionId, answerId]) => {
          const question = questions.find(q => q.id === questionId);
          if (question) {
            const correctAnswer = question.answers.find(a => a.isCorrect);
            userAnswers[questionId] = {
              questionId,
              selectedAnswerIds: [answerId],
              isCorrect: answerId === correctAnswer?.id,
              timeSpent: 0,
              isFavorite: favorites.has(questionId),
            };
          }
        });

        await indexedDBService.saveSession({
          ...session,
          currentIndex,
          userAnswers,
        });
      }
    } catch (err) {
      console.error("Failed to save session progress:", err);
    }
  };

  // Save progress when index or answers change
  useEffect(() => {
    if (!loading && questions.length > 0) {
      saveSessionProgress();
    }
  }, [currentIndex, selectedAnswers]);

  const currentQuestion = questions[currentIndex];
  const selectedAnswerId = selectedAnswers[currentQuestion?.id];
  const progress =
    questions.length > 0 ? ((currentIndex + 1) / questions.length) * 100 : 0;

  const handleAnswerSelect = (answerId: string) => {
    setSelectedAnswers({ ...selectedAnswers, [currentQuestion.id]: answerId });
  };

  const handleGoToQuestion = (index: number) => {
    setCurrentIndex(index);
    setShowResult(false);
    setShowQuickNav(false);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowResult(false);
    } else {
      setQuizCompleted(true);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setShowResult(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!currentQuestion) return;

    console.log('[Quiz] Toggle favorite for question:', currentQuestion.id);
    const newFavorites = new Set(favorites);
    if (newFavorites.has(currentQuestion.id)) {
      console.log('[Quiz] Removing from favorites');
      newFavorites.delete(currentQuestion.id);
      await indexedDBService.removeFavorite(currentQuestion.id);
      console.log('[Quiz] Favorite removed');
    } else {
      console.log('[Quiz] Adding to favorites');
      newFavorites.add(currentQuestion.id);
      console.log('[Quiz] Calling addFavorite...');
      // Save the question WITH the correct answer pre-selected
      const correctAnswer = currentQuestion.answers.find(a => a.isCorrect);
      const questionWithCorrectAnswer = {
        ...currentQuestion,
        selectedAnswerId: correctAnswer?.id,
      };
      console.log('[Quiz] Saving with correct answer:', correctAnswer?.id);
      await indexedDBService.addFavorite(questionWithCorrectAnswer);
      console.log('[Quiz] Favorite added');
    }
    setFavorites(newFavorites);
    console.log('[Quiz] Favorites state updated, count:', newFavorites.size);
  };

  const handleShowResult = () => {
    setShowResult(true);
  };

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q) => {
      const selectedId = selectedAnswers[q.id];
      const correctAnswer = q.answers.find((a) => a.isCorrect);
      if (selectedId === correctAnswer?.id) {
        correct++;
      }
    });
    return Math.round((correct / questions.length) * 100);
  };

  // In exam mode, no immediate results - just go to next question
  const handleValidateOrNext = () => {
    if (sessionType === "exam") {
      // Exam mode: go directly to next question without showing results
      handleNext();
    } else {
      // Practice mode: show results then go to next
      if (showResult) {
        handleNext();
      } else {
        handleShowResult();
      }
    }
  };

  // Check if all questions have been answered
  const allQuestionsAnswered = questions.every(q => selectedAnswers[q.id]);
  const answeredCount = Object.keys(selectedAnswers).length;

  // Save completion and update statistics when quiz is completed
  useEffect(() => {
    const handleQuizCompletion = async () => {
      if (quizCompleted && sessionId) {
        console.log('[Quiz] Quiz completed, updating session and statistics...');
        try {
          // Update session status to COMPLETED
          const session = await indexedDBService.getSession(sessionId);
          if (session) {
            const completedSession: QuizSession = {
              ...session,
              status: QuizSessionStatus.COMPLETED,
              completedAt: new Date(),
            };
            await indexedDBService.saveSession(completedSession);
            console.log('[Quiz] Session marked as completed');

            // Update statistics
            await statisticsService.init();
            await statisticsService.updateFromSession(completedSession);
            console.log('[Quiz] Statistics updated');

            // If this is an exam session, save the attempt to the SavedExam
            if (session.type === "exam" && session.examId) {
              console.log('[Quiz] This is an exam, saving attempt to SavedExam...');
              await saveExamAttempt(completedSession, session.examId);
            }
          }
        } catch (error) {
          console.error('[Quiz] Failed to update session/statistics:', error);
        }
      }
    };

    handleQuizCompletion();
  }, [quizCompleted, sessionId]);

  const saveExamAttempt = async (completedSession: QuizSession, examId: string) => {
    try {
      // Get the SavedExam
      const exam = await indexedDBService.getExam(examId);
      if (!exam) {
        console.log('[Quiz] Exam not found:', examId);
        return;
      }

      console.log('[Quiz] Found SavedExam:', exam.name);

      // Calculate score
      let correct = 0;
      let answered = 0;
      completedSession.questions?.forEach((q) => {
        const userAnswer = completedSession.userAnswers[q.id];
        if (userAnswer) {
          answered++;
          if (userAnswer.isCorrect) {
            correct++;
          }
        }
      });
      const score = answered > 0 ? Math.round((correct / answered) * 100) : 0;

      // Calculate time spent
      const timeSpent = completedSession.completedAt
        ? Math.floor((new Date(completedSession.completedAt).getTime() - new Date(completedSession.startedAt).getTime()) / 1000)
        : 0;

      // Create the attempt
      const attempt = {
        id: `attempt-${Date.now()}`,
        type: exam.type,
        domain: exam.domain,
        questions: completedSession.questions || [],
        userAnswers: completedSession.userAnswers || {},
        score,
        totalQuestions: completedSession.questions?.length || 0,
        correctAnswers: correct,
        startedAt: completedSession.startedAt,
        completedAt: completedSession.completedAt || new Date(),
        timeSpent,
      };

      console.log('[Quiz] Created attempt:', attempt);

      // Update the SavedExam
      const updatedAttempts = [...exam.attempts, attempt];
      const newBestScore = Math.max(exam.bestScore, score);
      const newBestAttemptId = score > exam.bestScore ? attempt.id : exam.bestAttemptId;

      const updatedExam: SavedExam = {
        ...exam,
        attempts: updatedAttempts,
        bestScore: newBestScore,
        bestAttemptId: newBestAttemptId,
        lastAttemptAt: new Date(),
      };

      await indexedDBService.saveExam(updatedExam);
      console.log('[Quiz] Saved attempt to SavedExam, new best score:', newBestScore);
    } catch (error) {
      console.error('[Quiz] Failed to save exam attempt:', error);
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
    const score = calculateScore();
    const correctCount = questions.filter((q) => {
      const selectedId = selectedAnswers[q.id];
      const correctAnswer = q.answers.find((a) => a.isCorrect);
      return selectedId === correctAnswer?.id;
    }).length;

    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
          <Card>
            <CardContent className="text-center py-12">
              <div className="mb-8">
                <h1 className="font-mono font-bold text-3xl mb-2">
                  {sessionType === "exam" ? "Examen Terminé !" : "Quiz Terminé !"}
                </h1>
                <p className="text-ink-secondary">Voici vos résultats</p>
              </div>

              <div className="mb-8">
                <div className="text-6xl font-mono font-bold text-accent mb-2">
                  {score}%
                </div>
                <p className="text-ink-muted">
                  {correctCount} / {questions.length} réponses correctes
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 mb-8">
                <div className="p-4 bg-paper-secondary rounded">
                  <div className="font-mono text-xs text-ink-muted uppercase mb-1">
                    Questions marquées comme favoris
                  </div>
                  <div className="font-mono text-lg font-bold">
                    {favorites.size}
                  </div>
                </div>
              </div>

              {/* Review answers section - show all questions with correct answers */}
              <div className="text-left mb-8">
                <h2 className="font-mono font-semibold mb-4">Révision des réponses</h2>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {questions.map((q, index) => {
                    const selectedId = selectedAnswers[q.id];
                    const correctAnswer = q.answers.find((a) => a.isCorrect);
                    const isCorrect = selectedId === correctAnswer?.id;
                    const selectedAnswer = q.answers.find(a => a.id === selectedId);

                    return (
                      <div key={q.id} className="p-3 bg-paper-secondary rounded text-sm">
                        <div className="flex items-start gap-2">
                          <span className={`font-mono font-bold ${isCorrect ? 'text-domain-dl' : 'text-domain-ml'}`}>
                            {index + 1}.
                          </span>
                          <div className="flex-1">
                            <p className="font-medium mb-1">{q.question}</p>
                            <p className={`text-xs ${isCorrect ? 'text-domain-dl' : 'text-domain-ml'}`}>
                              {isCorrect ? '✓ Correct' : '✗ Incorrect'} -
                              Votre réponse: {selectedAnswer?.text || 'Non répondu'}
                            </p>
                            {!isCorrect && (
                              <p className="text-xs text-domain-dl mt-1">
                                Bonne réponse: {correctAnswer?.text}
                              </p>
                            )}
                            {q.explanation && (
                              <p className="text-xs text-ink-muted mt-2 italic">
                                {q.explanation}
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
                  onClick={() => router.push(sessionType === "exam" ? "/exam" : "/practice")}
                >
                  {sessionType === "exam" ? "Autre Examen" : "Nouveau Quiz"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
        {/* Header */}
        <div className="mb-4">
          {/* Mobile layout: stacked vertically */}
          <div className="sm:hidden space-y-2">
            {/* Row 1: Title and question counter */}
            <div className="flex items-center justify-between">
              <h1 className="font-mono font-semibold text-sm truncate flex-1">
                {sessionType === "exam" ? "Examen" : "Pratique"}
              </h1>
              <span className="font-mono text-xs text-ink-muted ml-2">
                {currentIndex + 1}/{questions.length}
              </span>
            </div>

            {/* Row 2: Actions and timer */}
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
                initialTime={timeLimit || 0}
                timeLimit={timeLimit}
                mode={sessionType === "exam" ? "countdown" : "countup"}
                isPaused={showResult}
                onTimeUp={() => setQuizCompleted(true)}
                compact
              />
            </div>
          </div>

          {/* Desktop layout: horizontal */}
          <div className="hidden sm:block">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Title and question counter */}
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="min-w-0">
                  <h1 className="font-mono font-semibold text-base">
                    {sessionType === "exam" ? "Mode Examen" : "Mode Pratique"}
                  </h1>
                  <p className="font-mono text-xs text-ink-muted">
                    Question {currentIndex + 1} / {questions.length}
                    {sessionType === "exam" && (
                      <span>
                        {` • ${answeredCount}/${questions.length} répondues`}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Right: Actions and timer */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <QuizTimer
                  initialTime={timeLimit || 0}
                  timeLimit={timeLimit}
                  mode={sessionType === "exam" ? "countdown" : "countup"}
                  isPaused={showResult}
                  onTimeUp={() => setQuizCompleted(true)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowQuickNav(!showQuickNav)}
                  title="Navigation rapide"
                >
                  <Grid3x3 className="w-4 h-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.back()}
                >
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
                  const isAnswered = selectedAnswers[q.id];
                  const isCurrent = index === currentIndex;
                  const isCorrect = isAnswered && q.answers.find(a => a.id === isAnswered)?.isCorrect;

                  return (
                    <button
                      key={q.id}
                      onClick={() => handleGoToQuestion(index)}
                      className={`
                        w-10 h-10 rounded font-mono text-sm font-medium transition-all
                        ${isCurrent
                          ? 'bg-accent text-paper-primary ring-2 ring-accent'
                          : 'bg-paper-secondary hover:bg-paper-dark'
                        }
                        ${isAnswered && !isCurrent
                          ? isCorrect
                            ? 'bg-domain-dl/20 text-domain-dl border border-domain-dl'
                            : 'bg-domain-ml/20 text-domain-ml border border-domain-ml'
                          : ''
                        }
                      `}
                      title={`Question ${index + 1}${isAnswered ? ' • Répondu' : ''}`}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-ink-muted">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-domain-dl/20 border border-domain-dl"></div>
                  <span>Correcte</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-domain-ml/20 border border-domain-ml"></div>
                  <span>Incorrecte</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-paper-secondary"></div>
                  <span>Non répondu</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Question Card */}
        {currentQuestion && (
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            selectedAnswerId={selectedAnswerId}
            onAnswerSelect={handleAnswerSelect}
            showResult={showResult}
            isFavorite={favorites.has(currentQuestion.id)}
            onToggleFavorite={handleToggleFavorite}
            questionNumber={currentIndex + 1}
          />
        )}

        {/* Navigation */}
        <div className="flex justify-between items-center mt-8">
          <Button
            variant="secondary"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Précédent
          </Button>

          {sessionType === "exam" ? (
            // Exam mode: No "Validate" button, just "Next" (can skip questions)
            <Button
              variant="primary"
              onClick={handleNext}
            >
              {currentIndex < questions.length - 1 ? (
                <>
                  Suivant
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              ) : (
                <>
                  Terminer l&apos;Examen
                  <CheckCircle className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          ) : (
            // Practice mode: Validate then Next
            showResult ? (
              <Button variant="primary" onClick={handleNext}>
                {currentIndex < questions.length - 1 ? (
                  <>
                    Suivant
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    Terminer
                    <CheckCircle className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={handleValidateOrNext}
                disabled={!selectedAnswerId}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Valider
              </Button>
            )
          )}
        </div>

        {sessionType === "exam" && !allQuestionsAnswered && (
          <p className="text-center text-sm text-ink-muted mt-4">
            {questions.length - answeredCount} question{questions.length - answeredCount > 1 ? 's' : ''} non répondue{questions.length - answeredCount > 1 ? 's' : ''}
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
