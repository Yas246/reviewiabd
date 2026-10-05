"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DomainSelector } from "@/components/features/DomainSelector";
import { Clock, FileText, Globe, History, RefreshCw, AlertTriangle, CheckCircle, Loader2, WifiOff, Sparkles } from "lucide-react";
import { Domain, QuizSession, SavedExam, DOMAIN_LABELS } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";
import { storageService } from "@/services/StorageService";
import { notificationService } from "@/services/NotificationService";
import { generationService } from "@/services/GenerationService";
import { questionBank } from "@/services/QuestionBankService";
import { shuffleArray, getAllDomains } from "@/lib/utils";
import { ProductTour, TourStep } from "@/components/ProductTour";

// ============================================
// EXAM PAGE
// Examens blancs. Source par défaut : banque
// locale (hors ligne). IA optionnelle.
// ============================================

const EXAM_TOUR_STEPS: TourStep[] = [
  {
    title: "Bienvenue en mode Examen",
    text: "Ici on s'entraîne comme à l'examen : chronomètre lancé, correction masquée pendant l'épreuve, score et corrigé complet à la fin.",
  },
  {
    target: "e-source",
    title: "Banque locale ou IA",
    text: "La banque locale tire des questions équilibrées entre les matières, hors ligne. La génération IA reste optionnelle.",
  },
  {
    target: "e-type",
    title: "Deux formats d'examen",
    text: "Complet : 40 questions en 2h, toutes les matières. Par matière : 20 questions en 1h pour cibler une révision.",
  },
  {
    target: "e-matiere",
    title: "Choisis la matière",
    text: "En examen par matière, sélectionne celle que tu veux travailler. Pour l'examen complet, cette étape n'existe pas.",
  },
  {
    target: "e-commencer",
    title: "Le chrono démarre",
    text: "Dès que tu cliques, le compte à rebours tourne : réponds à ton rythme, tu peux revenir sur les questions avant de rendre.",
  },
];

type Source = "local" | "ai";

export default function ExamPage() {
  const router = useRouter();
  const [source, setSource] = useState<Source>("local");
  const [examType, setExamType] = useState<"full" | "domain">("full");
  const [selectedDomain, setSelectedDomain] = useState<Domain>(Domain.MACHINE_LEARNING);
  const [isGenerating, setIsGenerating] = useState(false);
  const [savedExams, setSavedExams] = useState<SavedExam[]>([]);
  const [activeExamSession, setActiveExamSession] = useState<QuizSession | null>(null);
  const [bankTotal, setBankTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [interruptedSession, setInterruptedSession] = useState<QuizSession | null>(null);
  const [errorModal, setErrorModal] = useState<{
    show: boolean;
    message: string;
    sessionId: string;
    savedCount: number;
    requestedCount: number;
  } | null>(null);

  useEffect(() => {
    const loadSavedExams = async () => {
      try {
        await indexedDBService.init();
        const exams = await indexedDBService.getAllExams();
        setSavedExams(exams);

        const inProgress = await indexedDBService.getSessionsByStatus("IN_PROGRESS");
        const paused = await indexedDBService.getSessionsByStatus("PAUSED");
        const active = [...inProgress, ...paused].find((s) => s.type === "exam");
        if (active) {
          setActiveExamSession(active);
        }

        const stats = await questionBank.getStats();
        setBankTotal(stats.total);

        setLoading(false);
      } catch (error) {
        console.error('[Exam] Failed to load saved exams:', error);
        setLoading(false);
      }
    };

    loadSavedExams();
  }, []);

  useEffect(() => {
    const checkInterrupted = async () => {
      try {
        await indexedDBService.init();
        const interrupted = await generationService.findInterruptedGenerations();
        const examPending = interrupted
          .filter((s) => s.type === "exam")
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

  // ============================================
  // FLUX BANQUE LOCALE
  // ============================================

  const handleStartLocalExam = async () => {
    setIsGenerating(true);
    try {
      await indexedDBService.init();

      const questionCount = examType === "full" ? 40 : 20;
      const timeLimit = examType === "full" ? 7200 : 3600;

      const questions =
        examType === "full"
          ? await questionBank.pickBalanced(getAllDomains(), questionCount, 4)
          : await questionBank.pick({ domain: selectedDomain, count: questionCount });

      if (questions.length === 0) {
        alert("Aucune question disponible dans la banque locale pour cette configuration.");
        setIsGenerating(false);
        return;
      }

      const examId = `blanc-${examType}-${Date.now()}`;
      const sessionId = `exam-session-${Date.now()}`;
      const name =
        examType === "full"
          ? `Examen blanc complet (banque locale)`
          : `Blanc ${DOMAIN_LABELS[selectedDomain]}`;

      await indexedDBService.saveExam({
        id: examId,
        name,
        type: examType,
        domain: examType === "domain" ? selectedDomain : undefined,
        questions,
        attempts: [],
        bestScore: 0,
        bestAttemptId: "",
        createdAt: new Date(),
        lastAttemptAt: new Date(),
      });

      await indexedDBService.saveSession({
        id: sessionId,
        type: "exam",
        domain: examType === "domain" ? selectedDomain : undefined,
        questions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
        timeLimit,
        examId,
      });

      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Exam] Local start failed:', error);
      setIsGenerating(false);
      alert(`Erreur : ${error.message || "Erreur inconnue"}`);
    }
  };

  // ============================================
  // FLUX IA (optionnel)
  // ============================================

  const handleStartExamAI = async () => {
    setIsGenerating(true);
    setErrorModal(null);

    let taskId: string | undefined;

    try {
      await indexedDBService.init();
      const settings = await storageService.getSettings();
      const notificationsEnabled = settings?.notifyOnComplete ?? false;
      const questionCount = examType === "full" ? 40 : 20;
      const timeLimit = examType === "full" ? 7200 : 3600;

      if (notificationsEnabled) {
        taskId = await notificationService.createBackgroundTask(
          'exam-generation',
          examType === "domain" ? selectedDomain : "FULL_EXAM",
          questionCount
        );
        await notificationService.updateTaskStatus(taskId!, 'generating');
      }

      const sessionId = await generationService.generateWithIncrementalSave({
        type: "exam",
        domain: examType === "domain" ? selectedDomain : undefined,
        totalCount: questionCount,
        includeExplanations: true,
        timeLimit,
        examType,
        taskId,
      });

      if (examType === "full") {
        const allDomains = getAllDomains();
        await generationService.runMultiDomainGeneration(sessionId, allDomains, 4, {
          onBatchComplete: () => {},
          onSessionReady: (id) => {
            window.location.href = `/quiz?session=${id}`;
          },
          onGenerationComplete: (id) => {
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
        }, { taskId });
      } else {
        await generationService.runSingleDomainGeneration(sessionId, selectedDomain, 20, {
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
        }, { taskId });
      }
    } catch (error: any) {
      console.error("Failed to generate exam questions:", error);
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
      await generationService.resumeGeneration(interruptedSession.id, {
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
      });
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

  const handleDismissInterrupted = async () => {
    if (!interruptedSession) return;
    try {
      const session = await indexedDBService.getSession(interruptedSession.id);
      if (session) {
        await indexedDBService.saveSession({
          ...session,
          status: "PAUSED" as any,
          generationProgress: session.generationProgress
            ? { ...session.generationProgress, isGenerating: false }
            : undefined,
        });
      }
    } catch {}
    setInterruptedSession(null);
  };

  const handleRetakeExam = async (exam: SavedExam) => {
    setIsGenerating(true);

    try {
      await indexedDBService.init();

      const shuffledQuestions = shuffleArray(
        exam.questions.map((q) => questionBank.shuffleQuestionAnswers(q))
      );

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

      await indexedDBService.saveExam({
        ...exam,
        lastAttemptAt: new Date(),
      });

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
          description="Simulez un examen réel avec limite de temps. Correction masquée jusqu'à la fin."
        />

        {/* Examen en cours */}
        {activeExamSession && (
          <Card className="mb-8 border-l-4 border-l-accent animate-fade-in-down">
            <CardContent>
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-mono font-semibold mb-1">Examen en cours</h3>
                  <p className="text-sm text-ink-secondary mb-1">
                    {Object.keys(activeExamSession.userAnswers).length} / {activeExamSession.questions.length} questions répondues
                  </p>
                  <div className="flex gap-3 mt-3">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => (window.location.href = `/quiz?session=${activeExamSession.id}`)}
                    >
                      Continuer
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await indexedDBService.deleteSession(activeExamSession.id);
                        setActiveExamSession(null);
                      }}
                    >
                      Recommencer
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Génération IA interrompue */}
        {interruptedSession && (
          <Card className="mb-8 border-l-4 border-l-accent animate-fade-in-down">
            <CardContent>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-mono font-semibold mb-1">Génération interrompue</h3>
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

        {/* Erreur IA */}
        {errorModal && (
          <Card className="mb-8 border-l-4 border-l-red-500 animate-fade-in-down">
            <CardContent>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-mono font-semibold mb-1">Génération interrompue</h3>
                  <p className="text-sm text-ink-secondary mb-1">{errorModal.message}</p>
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

        {/* Sélecteur de source */}
        <div data-tour="e-source" className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => setSource("local")}
            className={`card text-left ${source === "local" ? "ring-2 ring-accent" : ""}`}
          >
            <div className="flex items-start gap-3">
              <WifiOff className="w-5 h-5 text-domain-bigdata shrink-0 mt-1" />
              <div>
                <p className="font-mono font-semibold flex items-center gap-2">
                  Banque locale
                  <Badge variant="success">hors ligne</Badge>
                </p>
                <p className="text-sm text-ink-muted mt-1">
                  {bankTotal} questions embarquées + tes imports. Tirage équilibré entre les matières.
                </p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setSource("ai")}
            className={`card text-left ${source === "ai" ? "ring-2 ring-accent" : ""}`}
          >
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-domain-rec shrink-0 mt-1" />
              <div>
                <p className="font-mono font-semibold">Générer par IA</p>
                <p className="text-sm text-ink-muted mt-1">
                  Nouvelles questions générées en direct (connexion + clé API requises).
                </p>
              </div>
            </div>
          </button>
        </div>

        <div data-tour="e-type" className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Full Exam Card */}
          <Card hoverable onClick={() => setExamType("full")} className={examType === "full" ? "ring-2 ring-accent" : ""}>
            <CardContent>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded bg-domain-ml/20 flex items-center justify-center shrink-0">
                  <Globe className="w-6 h-6 text-domain-ml" />
                </div>
                <div className="flex-1">
                  <CardTitle>Examen Complet</CardTitle>
                  <p className="text-sm text-ink-muted mt-1">
                    Toutes les matières IABD
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
                  <span className="text-ink-muted">Matières</span>
                  <span className="font-mono font-medium">max 4 questions/matière</span>
                </div>
              </div>

              <Badge className="mt-4">RECOMMANDÉ</Badge>
            </CardContent>
          </Card>

          {/* Domain Exam Card */}
          <Card hoverable onClick={() => setExamType("domain")} className={examType === "domain" ? "ring-2 ring-accent" : ""}>
            <CardContent>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded bg-domain-dl/20 flex items-center justify-center shrink-0">
                  <FileText className="w-6 h-6 text-domain-dl" />
                </div>
                <div className="flex-1">
                  <CardTitle>Examen par Matière</CardTitle>
                  <p className="text-sm text-ink-muted mt-1">
                    Focus sur une matière spécifique
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
                  <span className="text-ink-muted">Matières</span>
                  <span className="font-mono font-medium">1</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Domain Selection (only for domain exam) */}
        {examType === "domain" && (
          <div data-tour="e-matiere">
            <Card className="mb-8 animate-fade-in-up">
              <CardContent>
                <h3 className="font-mono font-semibold mb-4">Sélection de la Matière</h3>
                <DomainSelector value={selectedDomain} onChange={setSelectedDomain} variant="grid" />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Actions */}
        <div data-tour="e-commencer" className="flex gap-4 justify-center items-center mb-12">
          <Button variant="secondary" onClick={() => router.back()} disabled={isGenerating}>
            Retour
          </Button>
          {source === "local" ? (
            <Button variant="primary" onClick={handleStartLocalExam} loading={isGenerating} disabled={isGenerating}>
              Commencer l&apos;Examen
            </Button>
          ) : (
            <Button variant="primary" onClick={handleStartExamAI} loading={isGenerating} disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Préparation...
                </>
              ) : (
                "Générer et Commencer"
              )}
            </Button>
          )}
        </div>

        {/* Saved Exams Section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <History className="w-5 h-5 text-accent" />
            <h2 className="font-mono font-semibold text-xl">Examens Précédents</h2>
            {savedExams.length > 0 && <Badge variant="default">{savedExams.length}</Badge>}
          </div>

          {loading ? (
            <p className="font-mono text-sm text-ink-muted">Chargement...</p>
          ) : savedExams.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
                <p className="text-ink-secondary mb-2">Aucun examen précédent</p>
                <p className="text-sm text-ink-muted">
                  Les examens blancs que tu passes sont sauvegardés ici pour pouvoir les refaire
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
                        <h3 className="font-mono font-semibold mb-1">{exam.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <span>{exam.type === "full" ? "40 questions" : "20 questions"}</span>
                          <span>•</span>
                          <span>{exam.type === "full" ? "2h" : "1h"}</span>
                        </div>
                      </div>
                      {exam.bestScore > 0 && <Badge variant="success">{exam.bestScore}%</Badge>}
                    </div>

                    <div className="flex items-center justify-between text-xs text-ink-muted mb-4">
                      <span>Créé le {new Date(exam.createdAt).toLocaleDateString("fr-FR")}</span>
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
      <ProductTour id="exam" steps={EXAM_TOUR_STEPS} />
    </div>
  );
}
