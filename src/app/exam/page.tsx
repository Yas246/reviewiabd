"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DomainSelector } from "@/components/features/DomainSelector";
import { Clock, FileText, Globe, History, RefreshCw } from "lucide-react";
import { Domain, SavedExam } from "@/types";
import { openRouterService } from "@/services/OpenRouterService";
import { indexedDBService } from "@/services/IndexedDBService";

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

  const handleStartExam = async () => {
    setIsGenerating(true);

    try {
      // Ensure IndexedDB is initialized
      await indexedDBService.init();

      let questions: any[] = [];

      if (examType === "full") {
        // Full exam: 4 questions from each of the 10 domains = 40 questions
        const domains = Object.values(Domain);
        const questionsPerDomain = 4;

        for (const domain of domains) {
          const domainQuestions = await openRouterService.generateQuestions({
            domain,
            count: questionsPerDomain,
            includeExplanations: true,
          });
          questions.push(...domainQuestions);
        }

        // Shuffle questions to mix domains
        questions = questions.sort(() => Math.random() - 0.5);
      } else {
        // Domain exam: 20 questions from selected domain
        questions = await openRouterService.generateQuestions({
          domain: selectedDomain,
          count: 20,
          includeExplanations: true,
        });
      }

      // Save exam as template for reuse (with questions!)
      const examId = `exam-${examType}-${Date.now()}`;
      const examName = examType === "full"
        ? "Examen Complet"
        : `Examen ${selectedDomain.replace(/_/g, " ")}`;

      const savedExam: SavedExam = {
        id: examId,
        name: examName,
        type: examType,
        domain: examType === "domain" ? selectedDomain : undefined,
        questions, // Store the questions for reuse!
        attempts: [],
        bestScore: 0,
        bestAttemptId: "",
        createdAt: new Date(),
        lastAttemptAt: new Date(),
      };

      await indexedDBService.saveExam(savedExam);
      console.log('[Exam] Saved exam template with questions:', examId);

      // Create session for this attempt (shuffle questions for variety)
      const shuffledQuestions = [...questions].sort(() => Math.random() - 0.5);
      const sessionId = `exam-session-${Date.now()}`;
      const timeLimit = examType === "full" ? 7200 : 3600; // 2h or 1h

      await indexedDBService.saveSession({
        id: sessionId,
        type: "exam",
        domain: examType === "domain" ? selectedDomain : undefined,
        questions: shuffledQuestions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
        timeLimit,
        examId, // Link to the exam template
      });

      // Navigate to quiz page with session ID
      // Use direct navigation to avoid RSC prefetch which fails offline
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error("Failed to generate exam questions:", error);
      setIsGenerating(false);
      // TODO: Show error toast/notification
      alert(`Erreur lors de la génération: ${error.message || "Erreur inconnue"}`);
    }
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Full Exam Card */}
          <Card
            hoverable
            onClick={() => setExamType("full")}
            className={examType === "full" ? "ring-2 ring-accent" : ""}
          >
            <CardContent>
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded bg-domain-ml/20 flex items-center justify-center flex-shrink-0">
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
                <div className="w-12 h-12 rounded bg-domain-dl/20 flex items-center justify-center flex-shrink-0">
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
          <Button variant="primary" onClick={handleStartExam} loading={isGenerating}>
            {isGenerating ? "Préparation..." : "Commencer l'Examen"}
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
