"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DomainSelector } from "@/components/features/DomainSelector";
import { QuestionCounter } from "@/components/features/QuestionCounter";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { Domain, Question, SavedPracticeQuiz, QuizSession } from "@/types";
import { Loader2, Play, History, RefreshCw, Trash2, AlertTriangle, CheckCircle } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { storageService } from "@/services/StorageService";
import { notificationService } from "@/services/NotificationService";
import { generationService } from "@/services/GenerationService";

// ============================================
// PRACTICE PAGE
// Select domain and number of questions, then generate
// ============================================

export default function PracticePage() {
  const router = useRouter();
  const [selectedDomain, setSelectedDomain] = useState<Domain>(Domain.MACHINE_LEARNING);
  const [questionCount, setQuestionCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedQuestions, setGeneratedQuestions] = useState(0);
  const [savedQuizzes, setSavedQuizzes] = useState<SavedPracticeQuiz[]>([]);
  const [loading, setLoading] = useState(true);

  // Interrupted generation state
  const [interruptedSession, setInterruptedSession] = useState<QuizSession | null>(null);

  // Error modal state
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    message: string;
    sessionId: string;
    savedCount: number;
    requestedCount: number;
  } | null>(null);

  // Load saved quizzes on mount
  useEffect(() => {
    const loadSavedQuizzes = async () => {
      console.log('[Practice] Loading saved quizzes...');
      try {
        await indexedDBService.init();
        const quizzes = await indexedDBService.getAllPracticeQuizzes();
        console.log('[Practice] Loaded', quizzes.length, 'saved quizzes');
        setSavedQuizzes(quizzes);
        setLoading(false);
      } catch (error) {
        console.error('[Practice] Failed to load saved quizzes:', error);
        setLoading(false);
      }
    };

    loadSavedQuizzes();
  }, []);

  // Check for interrupted generations on mount
  useEffect(() => {
    const checkInterrupted = async () => {
      try {
        await indexedDBService.init();
        const interrupted = await generationService.findInterruptedGenerations();

        if (interrupted.length > 0) {
          // Show the most recent interrupted session
          const sorted = interrupted.sort(
            (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
          );
          setInterruptedSession(sorted[0]);
        }
      } catch (error) {
        console.error('[Practice] Failed to check interrupted generations:', error);
      }
    };

    checkInterrupted();
  }, []);

  const handleGenerate = async () => {
    console.log('[Practice] Generate button clicked');
    console.log('[Practice] Configuration:', {
      domain: selectedDomain,
      questionCount,
      timestamp: new Date().toISOString()
    });

    setIsGenerating(true);
    setProgress(0);
    setGeneratedQuestions(0);
    setErrorModal(null);

    let taskId: string | undefined;

    try {
      await indexedDBService.init();
      const settings = await storageService.getSettings();
      const notificationsEnabled = settings?.notifyOnComplete ?? false;

      // Create background task if notifications are enabled
      if (notificationsEnabled) {
        taskId = await notificationService.createBackgroundTask(
          'quiz-generation',
          selectedDomain,
          questionCount
        );
        await notificationService.updateTaskStatus(taskId!, 'generating');
        console.log('[Practice] Created background task:', taskId);
      }

      console.log('[Practice] Starting incremental generation...');

      // Create the session immediately
      const sessionId = await generationService.generateWithIncrementalSave({
        type: "practice",
        domain: selectedDomain,
        totalCount: questionCount,
        includeExplanations: true,
        taskId,
      });

      console.log('[Practice] Session created:', sessionId, 'Starting batch generation...');

      // Run the generation loop
      await generationService.runSingleDomainGeneration(
        sessionId,
        selectedDomain,
        questionCount,
        {
          onBatchComplete: (p) => {
            setGeneratedQuestions(p.current);
            setProgress((p.current / p.total) * 100);
          },
          onSessionReady: (id) => {
            // Navigate to quiz after first batch (progressive display)
            console.log('[Practice] First batch ready, navigating to quiz:', id);
            window.location.href = `/quiz?session=${id}`;
          },
          onGenerationComplete: (id) => {
            console.log('[Practice] Generation complete:', id);
            setIsGenerating(false);
          },
          onGenerationError: (error, id, savedCount, requestedCount) => {
            console.error('[Practice] Generation error:', error, 'Saved:', savedCount);
            setIsGenerating(false);

            if (savedCount > 0) {
              // Show error modal with option to use partial questions
              setErrorModal({
                show: true,
                message: error.message,
                sessionId: id,
                savedCount,
                requestedCount,
              });
            } else {
              alert(`Erreur lors de la génération: ${error.message}`);
            }
          },
        },
        { taskId }
      );
    } catch (error: any) {
      console.error('[Practice] ERROR during generation:', error);
      setIsGenerating(false);
      setProgress(0);
      setGeneratedQuestions(0);
      alert(`Erreur lors de la génération: ${error.message || "Erreur inconnue"}`);
    }
  };

  const handleResumeGeneration = async () => {
    if (!interruptedSession) return;

    setIsGenerating(true);
    setProgress(0);
    setErrorModal(null);
    setInterruptedSession(null);

    const gp = interruptedSession.generationProgress!;
    setGeneratedQuestions(interruptedSession.questions.length);

    try {
      await generationService.resumeGeneration(
        interruptedSession.id,
        {
          onBatchComplete: (p) => {
            setGeneratedQuestions(p.current);
            setProgress((p.current / p.total) * 100);
          },
          onSessionReady: (id) => {
            window.location.href = `/quiz?session=${id}`;
          },
          onGenerationComplete: (id) => {
            setIsGenerating(false);
            window.location.href = `/quiz?session=${id}`;
          },
          onGenerationError: (error, id, savedCount, requestedCount) => {
            setIsGenerating(false);
            if (savedCount > 0) {
              setErrorModal({
                show: true,
                message: error.message,
                sessionId: id,
                savedCount,
                requestedCount,
              });
            } else {
              alert(`Erreur: ${error.message}`);
            }
          },
        }
      );
    } catch (error: any) {
      setIsGenerating(false);
      alert(`Erreur: ${error.message}`);
    }
  };

  const handleUsePartialQuestions = async () => {
    if (!errorModal) return;

    try {
      await generationService.finalizeAsPartial(errorModal.sessionId);
      setErrorModal(null);
      window.location.href = `/quiz?session=${errorModal.sessionId}`;
    } catch (error: any) {
      alert(`Erreur: ${error.message}`);
    }
  };

  const handleUseInterruptedQuestions = async () => {
    if (!interruptedSession) return;

    try {
      await generationService.finalizeAsPartial(interruptedSession.id);
      setInterruptedSession(null);
      window.location.href = `/quiz?session=${interruptedSession.id}`;
    } catch (error: any) {
      alert(`Erreur: ${error.message}`);
    }
  };

  const handleDismissInterrupted = () => {
    setInterruptedSession(null);
  };

  const handleRetakeQuiz = async (quiz: SavedPracticeQuiz) => {
    console.log('[Practice] Retaking quiz:', quiz.id);
    setIsGenerating(true);

    try {
      await indexedDBService.init();

      // Reuse saved questions (shuffle for variety)
      const shuffledQuestions = [...quiz.questions].sort(() => Math.random() - 0.5);
      console.log('[Practice] Reusing', shuffledQuestions.length, 'saved questions');

      // Create new session
      const sessionId = `practice-${Date.now()}`;
      await indexedDBService.saveSession({
        id: sessionId,
        type: "practice",
        domain: quiz.domain,
        questions: shuffledQuestions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
        practiceQuizId: quiz.id,
      });

      // Update attempt count and timestamp
      const updatedQuiz = {
        ...quiz,
        attempts: quiz.attempts + 1,
        lastAttemptAt: new Date(),
      };
      await indexedDBService.savePracticeQuiz(updatedQuiz);

      // Update local state
      setSavedQuizzes(prev =>
        prev.map(q => q.id === quiz.id ? updatedQuiz : q)
      );

      console.log('[Practice] Session created, navigating to quiz...');
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Practice] Failed to retake quiz:', error);
      setIsGenerating(false);
      alert(`Erreur: ${error.message || "Erreur inconnue"}`);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!confirm('Supprimer ce quiz ? Cette action est irréversible.')) {
      return;
    }

    try {
      await indexedDBService.deletePracticeQuiz(quizId);
      setSavedQuizzes(prev => prev.filter(q => q.id !== quizId));
      console.log('[Practice] Quiz deleted:', quizId);
    } catch (error: any) {
      console.error('[Practice] Failed to delete quiz:', error);
      alert(`Erreur: ${error.message || "Erreur inconnue"}`);
    }
  };

  const canStart = selectedDomain && questionCount >= 5 && !isGenerating;

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
        <PageHeader
          title="Mode Pratique"
          description="Configurez votre session de révision"
        />

        {/* Interrupted Generation Modal */}
        {interruptedSession && (
          <Card className="mb-8 border-l-4 border-l-accent animate-fade-in-down">
            <CardContent>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-mono font-semibold mb-1">
                    Génération interrompue
                  </h3>
                  <p className="text-sm text-ink-secondary mb-1">
                    {interruptedSession.generationProgress?.generationError
                      ? `Erreur : ${interruptedSession.generationProgress.generationError}`
                      : "La génération a été interrompue."}
                  </p>
                  <p className="text-sm text-ink-muted mb-3">
                    {interruptedSession.questions.length} / {interruptedSession.generationProgress?.requestedCount} questions sont déjà prêtes.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleResumeGeneration}
                      loading={isGenerating}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reprendre la génération
                    </Button>
                    {interruptedSession.questions.length >= 5 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleUseInterruptedQuestions}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Commencer avec {interruptedSession.questions.length} questions
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleDismissInterrupted}
                    >
                      Ignorer
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error Modal */}
        {errorModal && (
          <Card className="mb-8 border-l-4 border-l-red-500 animate-fade-in-down">
            <CardContent>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-mono font-semibold mb-1">
                    Génération interrompue
                  </h3>
                  <p className="text-sm text-ink-secondary mb-1">
                    {errorModal.message}
                  </p>
                  <p className="text-sm text-ink-muted mb-3">
                    {errorModal.savedCount} / {errorModal.requestedCount} questions ont été sauvegardées et sont utilisables.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleUsePartialQuestions}
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Commencer avec {errorModal.savedCount} questions
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        setErrorModal(null);
                        setIsGenerating(true);
                        try {
                          await generationService.resumeGeneration(
                            errorModal.sessionId,
                            {
                              onBatchComplete: (p) => {
                                setGeneratedQuestions(p.current);
                                setProgress((p.current / p.total) * 100);
                              },
                              onSessionReady: (id) => {
                                window.location.href = `/quiz?session=${id}`;
                              },
                              onGenerationComplete: (id) => {
                                setIsGenerating(false);
                                window.location.href = `/quiz?session=${id}`;
                              },
                              onGenerationError: (err, _id, saved) => {
                                setIsGenerating(false);
                                setErrorModal({
                                  show: true,
                                  message: err.message,
                                  sessionId: errorModal.sessionId,
                                  savedCount: saved,
                                  requestedCount: errorModal.requestedCount,
                                });
                              },
                            }
                          );
                        } catch (err: any) {
                          setIsGenerating(false);
                          alert(`Erreur: ${err.message}`);
                        }
                      }}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Réessayer
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setErrorModal(null)}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Configuration Card */}
        <Card className="mb-8">
          <CardContent>
            <div className="space-y-8">
              {/* Domain Selection */}
              <div>
                <h3 className="font-mono font-semibold mb-4">01. Domaine IABD</h3>
                <DomainSelector
                  value={selectedDomain}
                  onChange={setSelectedDomain}
                  variant="grid"
                />
              </div>

              {/* Question Count */}
              <div>
                <h3 className="font-mono font-semibold mb-4">
                  02. Nombre de Questions
                </h3>
                <QuestionCounter
                  value={questionCount}
                  onChange={setQuestionCount}
                />
              </div>

              {/* Summary */}
              <div className="border-t border-paper-dark pt-6">
                <h3 className="font-mono font-semibold mb-4">Résumé</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Domaine
                    </span>
                    <p className="font-medium mt-1">{selectedDomain.replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Questions
                    </span>
                    <p className="font-medium mt-1">{questionCount}</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Batches
                    </span>
                    <p className="font-medium mt-1">{Math.ceil(questionCount / 10)}</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Durée estimée
                    </span>
                    <p className="font-medium mt-1">{~Math.ceil(questionCount / 2)} min</p>
                  </div>
                </div>
              </div>

              {/* Progress Bar (during generation) */}
              {isGenerating && (
                <div className="border-t border-paper-dark pt-6">
                  <h3 className="font-mono font-semibold mb-4">Génération en cours...</h3>
                  <ProgressBar
                    value={progress}
                    showLabel
                    label="Questions générées"
                  />
                  <p className="font-mono text-xs text-ink-muted mt-2 text-center">
                    {generatedQuestions} / {questionCount}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-center items-center">
          <Button variant="secondary" onClick={() => router.back()} disabled={isGenerating}>
            Retour
          </Button>
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={!canStart}
            loading={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Générer et Commencer
              </>
            )}
          </Button>
        </div>

        {/* Info Box */}
        <Card className="mt-8 border-l-4 border-l-accent">
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-accent" />
                <h3 className="font-mono font-semibold text-sm">Comment ça marche ?</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      1
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Les questions sont générées par lots de <span className="font-mono text-accent">10</span>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      2
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Commencez le quiz dès que le 1er lot est prêt
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      3
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Si la génération échoue, les questions déjà prêtes sont utilisables
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      4
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Pas de limite de temps en mode Pratique
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Saved Practice Quizzes Section */}
        <div className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <History className="w-5 h-5 text-accent" />
            <h2 className="font-mono font-semibold text-xl">
              Quiz Précédents
            </h2>
            {savedQuizzes.length > 0 && (
              <Badge variant="default">{savedQuizzes.length}</Badge>
            )}
          </div>

          {loading ? (
            <p className="font-mono text-sm text-ink-muted">Chargement...</p>
          ) : savedQuizzes.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
                <p className="text-ink-secondary mb-2">
                  Aucun quiz précédent
                </p>
                <p className="text-sm text-ink-muted">
                  Les quiz que vous générerez seront sauvegardés ici pour pouvoir les refaire
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedQuizzes.map((quiz) => (
                <Card key={quiz.id} hoverable>
                  <CardContent>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-mono font-semibold mb-1">
                          {quiz.domain.replace(/_/g, " ")}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <span>{quiz.questionCount} questions</span>
                          <span>•</span>
                          <span>Pratique</span>
                        </div>
                      </div>
                      {quiz.bestScore && (
                        <Badge variant="success">{quiz.bestScore}%</Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-ink-muted mb-4">
                      <span>
                        Créé le {new Date(quiz.createdAt).toLocaleDateString("fr-FR")}
                      </span>
                      <span>
                        {quiz.attempts} tentative{quiz.attempts > 1 ? "s" : ""}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        className="flex-1"
                        size="sm"
                        onClick={() => handleRetakeQuiz(quiz)}
                        loading={isGenerating}
                        disabled={isGenerating}
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refaire
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeleteQuiz(quiz.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
