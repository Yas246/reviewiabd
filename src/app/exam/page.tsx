"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DomainSelector } from "@/components/features/DomainSelector";
import { Clock, FileText, Globe, History, RefreshCw, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { Domain, QuizSession, SavedExam } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";
import { storageService } from "@/services/StorageService";
import { notificationService } from "@/services/NotificationService";
import { generationService } from "@/services/GenerationService";

// ============================================
// EXAM PAGE
// Choose between full exam (40 questions) or domain exam
// ============================================

export default function ExamPage() {
  const router = useRouter();
  const [examType, setExamType] = useState<"full" | "domain">("full");
  const [selectedDomain, setSelectedDomain] = useState<Domain>(Domain.MACHINE_LEARNING);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedExams, setSavedExams] = useState<SavedExam[]>([]);
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

  // Load saved exams on mount
  useEffect(() => {
    const loadSavedExams = async () => {
      console.log('[Exam] Loading saved exams...');
      try {
        await indexedDBService.init();
        const exams = await indexedDBService.getAllExams();
        console.log('[Exam] Loaded', exams.length, 'saved exams');
        setSavedExams(exams);
        setLoading(false);
      } catch (error) {
        console.error('[Exam] Failed to load saved exams:', error);
        setLoading(false);
      }
    };

    loadSavedExams();
  }, []);

  // Check for interrupted generations on mount
  useEffect(() => {
    const checkInterrupted = async () => {
      try {
        await indexedDBService.init();
        const interrupted = await generationService.findInterruptedGenerations();
        const failed = await generationService.findFailedGenerations();

        const examPending = [...interrupted, ...failed]
          .filter(s => s.type === "exam")
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

        if (examPending.length > 0) {
          setInterruptedSession(examPending[0]);
        }
      } catch (error) {
        console.error('[Exam] Failed to check interrupted generations:', error);
      }
    };

    checkInterrupted();
  }, []);

  const handleStartExam = async () => {
    setIsGenerating(true);
    setErrorModal(null);

    let taskId: string | undefined;

    try {
      await indexedDBService.init();
      const settings = await storageService.getSettings();
      const notificationsEnabled = settings?.notifyOnComplete ?? false;
      const questionCount = examType === "full" ? 40 : 20;
      const timeLimit = examType === "full" ? 7200 : 3600;

      // Create background task if notifications are enabled
      if (notificationsEnabled) {
        taskId = await notificationService.createBackgroundTask(
          'exam-generation',
          examType === "domain" ? selectedDomain : "FULL_EXAM",
          questionCount
        );
        await notificationService.updateTaskStatus(taskId!, 'generating');
        console.log('[Exam] Created background task:', taskId);
      }

      // Create session immediately with GENERATING status
      const sessionId = await generationService.generateWithIncrementalSave({
        type: "exam",
        domain: examType === "domain" ? selectedDomain : undefined,
        totalCount: questionCount,
        includeExplanations: true,
        timeLimit,
        examType,
        taskId,
      });

      console.log('[Exam] Session created:', sessionId);

      // Run generation based on exam type
      if (examType === "full") {
        const allDomains = Object.values(Domain);
        await generationService.runMultiDomainGeneration(
          sessionId,
          allDomains,
          4, // 4 questions per domain
          {
            onBatchComplete: () => {
              // Could add progress bar for exam too
            },
            onSessionReady: (id) => {
              console.log('[Exam] First group ready, navigating to quiz:', id);
              window.location.href = `/quiz?session=${id}`;
            },
            onGenerationComplete: (id) => {
              console.log('[Exam] Generation complete:', id);
              setIsGenerating(false);
            },
            onGenerationError: (error, id, savedCount, requestedCount) => {
              console.error('[Exam] Generation error:', error);
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
                alert(`Erreur lors de la génération: ${error.message}`);
              }
            },
          },
          { taskId }
        );
      } else {
        // Domain exam: 20 questions from single domain
        await generationService.runSingleDomainGeneration(
          sessionId,
          selectedDomain,
          20,
          {
            onBatchComplete: () => {},
            onSessionReady: (id) => {
              window.location.href = `/quiz?session=${id}`;
            },
            onGenerationComplete: (id) => {
              setIsGenerating(false);
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
                alert(`Erreur lors de la génération: ${error.message}`);
              }
            },
          },
          { taskId }
        );
      }
    } catch (error: any) {
      console.error("Failed to generate exam questions:", error);

      if (taskId) {
        await notificationService.updateTaskStatus(
          taskId,
          'failed',
          undefined,
          error.message || "Erreur inconnue"
        );
      }

      setIsGenerating(false);
      alert(`Erreur lors de la génération: ${error.message || "Erreur inconnue"}`);
    }
  };

  const handleResumeGeneration = async () => {
    if (!interruptedSession) return;

    setIsGenerating(true);
    setInterruptedSession(null);
    setErrorModal(null);

    try {
      await generationService.resumeGeneration(
        interruptedSession.id,
        {
          onBatchComplete: () => {},
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
    if (errorModal) {
      try {
        await generationService.finalizeAsPartial(errorModal.sessionId);
        setErrorModal(null);
        window.location.href = `/quiz?session=${errorModal.sessionId}`;
      } catch (error: any) {
        alert(`Erreur: ${error.message}`);
      }
      return;
    }
    if (interruptedSession) {
      try {
        await generationService.finalizeAsPartial(interruptedSession.id);
        setInterruptedSession(null);
        window.location.href = `/quiz?session=${interruptedSession.id}`;
      } catch (error: any) {
        alert(`Erreur: ${error.message}`);
      }
    }
  };

  const handleDismissInterrupted = () => {
    setInterruptedSession(null);
  };

  const handleRetakeExam = async (exam: SavedExam) => {
    console.log('[Exam] Retaking exam:', exam.id);
    setIsGenerating(true);

    try {
      await indexedDBService.init();

      // Reuse the saved questions (just shuffle them for variety)
      const shuffledQuestions = [...exam.questions].sort(() => Math.random() - 0.5);
      console.log('[Exam] Reusing', shuffledQuestions.length, 'saved questions');

      // Create new session
      const sessionId = `exam-session-${Date.now()}`;
      const timeLimit = exam.type === "full" ? 7200 : 3600;

      await indexedDBService.saveSession({
        id: sessionId,
        type: "exam",
        domain: exam.domain,
        questions: shuffledQuestions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
        timeLimit,
        examId: exam.id,
      });

      // Update lastAttemptAt
      await indexedDBService.saveExam({
        ...exam,
        lastAttemptAt: new Date(),
      });

      console.log('[Exam] Session created, navigating to quiz...');
      // Use direct navigation to avoid RSC prefetch which fails offline
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Exam] Failed to retake exam:', error);
      setIsGenerating(false);
      alert(`Erreur: ${error.message || "Erreur inconnue"}`);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
        <PageHeader
          title="Mode Examen"
          description="Simulez un examen réel avec limite de temps"
        />

        {/* Interrupted Generation Banner */}
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
                    <Button variant="primary" size="sm" onClick={handleResumeGeneration} loading={isGenerating}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reprendre
                    </Button>
                    {interruptedSession.questions.length >= 5 && (
                      <Button variant="secondary" size="sm" onClick={handleUsePartialQuestions}>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Commencer avec {interruptedSession.questions.length} questions
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={handleDismissInterrupted}>
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
                    {errorModal.savedCount} / {errorModal.requestedCount} questions ont été sauvegardées.
                  </p>
                  <div className="flex gap-3">
                    <Button variant="primary" size="sm" onClick={handleUsePartialQuestions}>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Commencer avec {errorModal.savedCount} questions
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setErrorModal(null)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Full Exam Card */}
          <Card
            hoverable
            onClick={() => setExamType("full")}
            className={examType === "full" ? "ring-2 ring-accent" : ""}
          >
            <CardContent>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded bg-domain-ml/20 flex items-center justify-center shrink-0">
                  <Globe className="w-6 h-6 text-domain-ml" />
                </div>
                <div className="flex-1">
                  <CardTitle>Examen Complet</CardTitle>
                  <p className="text-sm text-ink-muted mt-1">
                    Tous les domaines IABD
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Questions</span>
                  <span className="font-mono font-medium">40</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Durée</span>
                  <span className="font-mono font-medium flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    2h
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Domaines</span>
                  <span className="font-mono font-medium">10</span>
                </div>
              </div>

              <Badge className="mt-4">RECOMMANDÉ</Badge>
            </CardContent>
          </Card>

          {/* Domain Exam Card */}
          <Card
            hoverable
            onClick={() => setExamType("domain")}
            className={examType === "domain" ? "ring-2 ring-accent" : ""}
          >
            <CardContent>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded bg-domain-dl/20 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-domain-dl" />
                </div>
                <div className="flex-1">
                  <CardTitle>Examen par Domaine</CardTitle>
                  <p className="text-sm text-ink-muted mt-1">
                    Focus sur un domaine spécifique
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Questions</span>
                  <span className="font-mono font-medium">20</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Durée</span>
                  <span className="font-mono font-medium flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    1h
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">Domaines</span>
                  <span className="font-mono font-medium">1</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Domain Selection (only for domain exam) */}
        {examType === "domain" && (
          <Card className="mb-8 animate-fade-in-up">
            <CardContent>
              <h3 className="font-mono font-semibold mb-4">Sélection du Domaine</h3>
              <DomainSelector
                value={selectedDomain}
                onChange={setSelectedDomain}
                variant="grid"
              />
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        <Card className="mb-8">
          <CardContent>
            <h3 className="font-mono font-semibold mb-4">Résumé de l'Examen</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="font-mono text-xs text-ink-muted uppercase">Type</span>
                <p className="font-medium mt-1">
                  {examType === "full" ? "Complet" : "Domaine"}
                </p>
              </div>
              <div>
                <span className="font-mono text-xs text-ink-muted uppercase">Questions</span>
                <p className="font-medium mt-1">
                  {examType === "full" ? "40" : "20"}
                </p>
              </div>
              <div>
                <span className="font-mono text-xs text-ink-muted uppercase">Durée</span>
                <p className="font-medium mt-1">
                  {examType === "full" ? "2h" : "1h"}
                </p>
              </div>
              <div>
                <span className="font-mono text-xs text-ink-muted uppercase">Batches</span>
                <p className="font-medium mt-1">
                  {examType === "full" ? "4" : "2"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-center items-center mb-12">
          <Button variant="secondary" onClick={() => router.back()} disabled={isGenerating}>
            Retour
          </Button>
          <Button variant="primary" onClick={handleStartExam} loading={isGenerating} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Préparation...
              </>
            ) : (
              "Commencer l'Examen"
            )}
          </Button>
        </div>

        {/* Saved Exams Section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <History className="w-5 h-5 text-accent" />
            <h2 className="font-mono font-semibold text-xl">
              Examens Précédents
            </h2>
            {savedExams.length > 0 && (
              <Badge variant="default">{savedExams.length}</Badge>
            )}
          </div>

          {loading ? (
            <p className="font-mono text-sm text-ink-muted">Chargement...</p>
          ) : savedExams.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
                <p className="text-ink-secondary mb-2">
                  Aucun examen précédent
                </p>
                <p className="text-sm text-ink-muted">
                  Les examens que vous créerez seront sauvegardés ici pour pouvoir les refaire
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedExams.map((exam) => (
                <Card key={exam.id} hoverable>
                  <CardContent>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-mono font-semibold mb-1">
                          {exam.name}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <span>
                            {exam.type === "full" ? "40 questions" : "20 questions"}
                          </span>
                          <span>•</span>
                          <span>
                            {exam.type === "full" ? "2h" : "1h"}
                          </span>
                        </div>
                      </div>
                      {exam.bestScore > 0 && (
                        <Badge variant="success">{exam.bestScore}%</Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs text-ink-muted mb-4">
                      <span>
                        Créé le {new Date(exam.createdAt).toLocaleDateString("fr-FR")}
                      </span>
                      <span>
                        {exam.attempts.length} tentative{exam.attempts.length > 1 ? "s" : ""}
                      </span>
                    </div>

                    <Button
                      variant="primary"
                      className="w-full"
                      size="sm"
                      onClick={() => handleRetakeExam(exam)}
                      loading={isGenerating}
                      disabled={isGenerating}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refaire cet Examen
                    </Button>
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
