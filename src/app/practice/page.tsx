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
import { Domain, Question, SavedPracticeQuiz, QuizSession, DOMAIN_LABELS } from "@/types";
import { Loader2, Play, History, RefreshCw, Trash2, AlertTriangle, CheckCircle, WifiOff, Sparkles } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { storageService } from "@/services/StorageService";
import { notificationService } from "@/services/NotificationService";
import { generationService } from "@/services/GenerationService";
import { questionBank } from "@/services/QuestionBankService";
import { shuffleArray } from "@/lib/utils";

// ============================================
// PRACTICE PAGE
// Source par défaut : la banque locale (hors ligne,
// sans clé API). La génération IA reste optionnelle.
// ============================================

type Source = "local" | "ai";

const DIFFICULTIES = [
  { value: "", label: "Toutes" },
  { value: "easy", label: "Facile" },
  { value: "medium", label: "Moyen" },
  { value: "hard", label: "Difficile" },
] as const;

export default function PracticePage() {
  const router = useRouter();
  const [source, setSource] = useState<Source>("local");
  const [selectedDomain, setSelectedDomain] = useState<Domain>(Domain.MACHINE_LEARNING);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<"" | "easy" | "medium" | "hard">("");
  const [bankStats, setBankStats] = useState<{ total: number; byDomain: Partial<Record<Domain, number>> }>({ total: 0, byDomain: {} });
  const [hasApiKey, setHasApiKey] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedQuestions, setGeneratedQuestions] = useState(0);
  const [savedQuizzes, setSavedQuizzes] = useState<SavedPracticeQuiz[]>([]);
  const [activePracticeSessions, setActivePracticeSessions] = useState<Map<string, QuizSession>>(new Map());
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
    const load = async () => {
      try {
        await indexedDBService.init();
        const quizzes = await indexedDBService.getAllPracticeQuizzes();
        setSavedQuizzes(quizzes);

        const sessionsMap = new Map<string, QuizSession>();
        const inProgress = await indexedDBService.getSessionsByStatus("IN_PROGRESS");
        const paused = await indexedDBService.getSessionsByStatus("PAUSED");
        for (const s of [...inProgress, ...paused]) {
          if (s.type === "practice" && s.practiceQuizId) {
            sessionsMap.set(s.practiceQuizId, s);
          }
        }
        setActivePracticeSessions(sessionsMap);

        const stats = await questionBank.getStats();
        setBankStats({ total: stats.total, byDomain: stats.byDomain });

        const settings = await storageService.getSettings();
        setHasApiKey(!!settings.apiKey || !!settings.geminiApiKey);

        setLoading(false);
      } catch (error) {
        console.error('[Practice] Failed to load:', error);
        setLoading(false);
      }
    };

    load();
  }, []);

  // Vérifie les générations IA interrompues
  useEffect(() => {
    const checkInterrupted = async () => {
      try {
        await indexedDBService.init();
        const interrupted = await generationService.findInterruptedGenerations();
        if (interrupted.length > 0) {
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

  // ============================================
  // FLUX BANQUE LOCALE (hors ligne)
  // ============================================

  const handleStartLocal = async () => {
    setIsGenerating(true);
    try {
      await indexedDBService.init();
      const questions = await questionBank.pick({
        domain: selectedDomain,
        count: questionCount,
        difficulty: difficulty || undefined,
        types: undefined,
      });

      if (questions.length === 0) {
        alert(
          `Aucune question disponible pour ce domaine${difficulty ? ` en difficulté "${difficulty}"` : ""}. Essaie une autre difficulté ou importe des questions depuis la page Importer.`
        );
        setIsGenerating(false);
        return;
      }

      const sessionId = `local-practice-${Date.now()}`;
      const quizId = `local-${selectedDomain}-${Date.now()}`;

      await indexedDBService.saveSession({
        id: sessionId,
        type: "practice",
        domain: selectedDomain,
        questions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
        practiceQuizId: quizId,
        label: `Pratique : ${DOMAIN_LABELS[selectedDomain]}`,
      });

      await indexedDBService.savePracticeQuiz({
        id: quizId,
        domain: selectedDomain,
        questionCount: questions.length,
        questions,
        attempts: 1,
        createdAt: new Date(),
        lastAttemptAt: new Date(),
        label: "Banque locale",
      });

      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Practice] Local start failed:', error);
      setIsGenerating(false);
      alert(`Erreur : ${error.message || "Erreur inconnue"}`);
    }
  };

  // ============================================
  // FLUX IA (optionnel)
  // ============================================

  const handleGenerateAI = async () => {
    if (!hasApiKey) {
      alert("Aucune clé API configurée. Utilise la banque locale (hors ligne) ou configure une clé dans Paramètres.");
      return;
    }

    setIsGenerating(true);
    setProgress(0);
    setGeneratedQuestions(0);
    setErrorModal(null);

    let taskId: string | undefined;

    try {
      await indexedDBService.init();
      const settings = await storageService.getSettings();
      const notificationsEnabled = settings?.notifyOnComplete ?? false;

      if (notificationsEnabled) {
        taskId = await notificationService.createBackgroundTask(
          'quiz-generation',
          selectedDomain,
          questionCount
        );
        await notificationService.updateTaskStatus(taskId!, 'generating');
      }

      const sessionId = await generationService.generateWithIncrementalSave({
        type: "practice",
        domain: selectedDomain,
        totalCount: questionCount,
        includeExplanations: true,
        taskId,
      });

      await generationService.runSingleDomainGeneration(
        sessionId,
        selectedDomain,
        questionCount,
        {
          onBatchComplete: (p) => {
            setGeneratedQuestions(p.current);
            setProgress((p.current / p.total) * 100);
          },
          onSessionReady: async (id) => {
            try {
              const session = await indexedDBService.getSession(id);
              if (session && !session.practiceQuizId) {
                const quizId = `practice-${session.domain}-${Date.now()}`;
                await indexedDBService.savePracticeQuiz({
                  id: quizId,
                  domain: session.domain!,
                  questionCount: session.questions.length,
                  questions: session.questions,
                  attempts: 1,
                  createdAt: session.startedAt,
                  lastAttemptAt: new Date(),
                });
                await indexedDBService.saveSession({
                  ...session,
                  practiceQuizId: quizId,
                });
              }
            } catch (err) {
              console.error('[Practice] Failed to create practice quiz:', err);
            }
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
      alert(`Erreur lors de la génération: ${error.message || "Erreur inconnue"}`);
    }
  };

  const handleResumeGeneration = async () => {
    if (!interruptedSession) return;

    setIsGenerating(true);
    setProgress(0);
    setErrorModal(null);
    setInterruptedSession(null);

    setGeneratedQuestions(interruptedSession.questions.length);

    try {
      await generationService.resumeGeneration(interruptedSession.id, {
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
      });
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

  const handleRetakeQuiz = async (quiz: SavedPracticeQuiz, clearOldSession?: string) => {
    setIsGenerating(true);

    try {
      await indexedDBService.init();

      if (clearOldSession) {
        await indexedDBService.deleteSession(clearOldSession);
      }

      // Reprise des questions sauvegardées, mélangées pour la variété
      const shuffledQuestions = shuffleArray(
        quiz.questions.map((q) => questionBank.shuffleQuestionAnswers(q))
      );

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

      const updatedQuiz = {
        ...quiz,
        attempts: quiz.attempts + 1,
        lastAttemptAt: new Date(),
      };
      await indexedDBService.savePracticeQuiz(updatedQuiz);

      setSavedQuizzes((prev) => prev.map((q) => (q.id === quiz.id ? updatedQuiz : q)));

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
      setSavedQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    } catch (error: any) {
      console.error('[Practice] Failed to delete quiz:', error);
      alert(`Erreur: ${error.message || "Erreur inconnue"}`);
    }
  };

  const domainCount = bankStats.byDomain[selectedDomain] || 0;
  const canStartLocal = !isGenerating && domainCount > 0 && questionCount >= 5;

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
        <PageHeader
          title="Mode Pratique"
          description="Configurez votre session de révision"
        />

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
                      Reprendre la génération
                    </Button>
                    {interruptedSession.questions.length >= 5 && (
                      <Button variant="secondary" size="sm" onClick={handleUseInterruptedQuestions}>
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
                    {errorModal.savedCount} / {errorModal.requestedCount} questions ont été sauvegardées et sont utilisables.
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
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
                  {bankStats.total} questions embarquées + tes imports. Sans clé API, sans connexion.
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
                <p className="font-mono font-semibold">
                  Générer par IA
                  {!hasApiKey && <Badge className="ml-2">clé requise</Badge>}
                </p>
                <p className="text-sm text-ink-muted mt-1">
                  Génère de nouvelles questions via OpenRouter ou Gemini (connexion requise).
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Configuration Card */}
        <Card className="mb-8">
          <CardContent>
            <div className="space-y-8">
              <div>
                <h3 className="font-mono font-semibold mb-4">01. {source === "local" ? "Matière" : "Domaine IABD"}</h3>
                <DomainSelector value={selectedDomain} onChange={setSelectedDomain} variant="grid" />
                {source === "local" && (
                  <p className="font-mono text-xs text-ink-muted mt-3">
                    {domainCount} question{domainCount > 1 ? "s" : ""} disponible
                    {domainCount > 1 ? "s" : ""} dans la banque locale pour cette matière.
                  </p>
                )}
              </div>

              <div>
                <h3 className="font-mono font-semibold mb-4">02. Nombre de Questions</h3>
                <QuestionCounter value={questionCount} onChange={setQuestionCount} />
              </div>

              {source === "local" && (
                <div>
                  <h3 className="font-mono font-semibold mb-4">03. Difficulté</h3>
                  <div className="flex flex-wrap gap-2">
                    {DIFFICULTIES.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setDifficulty(d.value)}
                        className={`px-4 py-2 rounded border font-mono text-sm transition-colors ${
                          difficulty === d.value
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-paper-dark text-ink-secondary hover:border-accent"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <p className="font-mono text-xs text-ink-muted mt-3">
                    Les formats variés sont inclus automatiquement : QCM, multi-réponses
                    (comme au tronc commun), Vrai/Faux, texte à trous, code, cas pratiques.
                  </p>
                </div>
              )}

              {source === "ai" && isGenerating && (
                <div className="border-t border-paper-dark pt-6">
                  <h3 className="font-mono font-semibold mb-4">Génération en cours...</h3>
                  <ProgressBar value={progress} showLabel label="Questions générées" />
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
          {source === "local" ? (
            <Button variant="primary" onClick={handleStartLocal} disabled={!canStartLocal} loading={isGenerating}>
              <Play className="w-4 h-4" />
              Commencer
            </Button>
          ) : (
            <Button variant="primary" onClick={handleGenerateAI} disabled={!canGenerateAI(questionCount)} loading={isGenerating}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Générer et Commencer
                </>
              )}
            </Button>
          )}
        </div>

        {source === "local" && domainCount === 0 && !loading && (
          <p className="text-center text-sm text-domain-ml mt-4">
            Cette matière n&apos;a pas encore de questions dans la banque locale. Importe-en
            depuis la page <a href="/import" className="text-accent underline">Importer</a>.
          </p>
        )}

        {/* Quiz précédents */}
        <div className="mt-12">
          <div className="flex items-center gap-3 mb-6">
            <History className="w-5 h-5 text-accent" />
            <h2 className="font-mono font-semibold text-xl">Quiz Précédents</h2>
            {savedQuizzes.length > 0 && <Badge variant="default">{savedQuizzes.length}</Badge>}
          </div>

          {loading ? (
            <p className="font-mono text-sm text-ink-muted">Chargement...</p>
          ) : savedQuizzes.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <History className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
                <p className="text-ink-secondary mb-2">Aucun quiz précédent</p>
                <p className="text-sm text-ink-muted">
                  Les quiz que tu démarres sont sauvegardés ici pour pouvoir les refaire
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedQuizzes.map((quiz) => {
                const activeSession = activePracticeSessions.get(quiz.id);
                const answeredCount = activeSession ? Object.keys(activeSession.userAnswers).length : 0;
                const totalQuestions = quiz.questionCount;

                return (
                  <Card key={quiz.id} hoverable>
                    <CardContent>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-mono font-semibold mb-1">
                            {quiz.label || quiz.domain.replace(/_/g, " ")}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-ink-muted">
                            <span>{totalQuestions} questions</span>
                            <span>•</span>
                            <span>{DOMAIN_LABELS[quiz.domain]?.split(" ")[0] || quiz.domain}</span>
                          </div>
                        </div>
                        {activeSession ? (
                          <Badge variant="default">
                            {answeredCount}/{totalQuestions}
                          </Badge>
                        ) : (
                          quiz.bestScore !== undefined && quiz.bestScore > 0 && (
                            <Badge variant="success">{quiz.bestScore}%</Badge>
                          )
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-ink-muted mb-4">
                        <span>Créé le {new Date(quiz.createdAt).toLocaleDateString("fr-FR")}</span>
                        <span>
                          {quiz.attempts} tentative{quiz.attempts > 1 ? "s" : ""}
                        </span>
                      </div>

                      {activeSession ? (
                        <div className="space-y-2">
                          <Button
                            variant="primary"
                            className="w-full"
                            size="sm"
                            onClick={() => (window.location.href = `/quiz?session=${activeSession.id}`)}
                          >
                            <Play className="w-4 h-4 mr-2" />
                            Continuer ({answeredCount}/{totalQuestions})
                          </Button>
                          <Button
                            variant="secondary"
                            className="w-full"
                            size="sm"
                            onClick={() => handleRetakeQuiz(quiz, activeSession.id)}
                            loading={isGenerating}
                            disabled={isGenerating}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Recommencer
                          </Button>
                        </div>
                      ) : (
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
                          <Button variant="secondary" size="sm" onClick={() => handleDeleteQuiz(quiz.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function canGenerateAI(questionCount: number): boolean {
  return questionCount >= 5;
}
