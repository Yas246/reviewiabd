"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DomainBadge } from "@/components/features/DomainSelector";
import { History, Trophy, Target, TrendingUp, Calendar } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { SavedExam, ExamAttempt } from "@/types";

// ============================================
// EXAMS HISTORY PAGE
// View past exams and results
// ============================================

export default function ExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<SavedExam[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadExams = async () => {
      console.log('[Exams] Loading exam history from IndexedDB...');
      try {
        await indexedDBService.init();
        const allExams = await indexedDBService.getAllExams();

        console.log('[Exams] Found', allExams.length, 'saved exams');
        setExams(allExams);
        setLoading(false);
      } catch (error) {
        console.error('[Exams] Failed to load exams:', error);
        setLoading(false);
      }
    };

    loadExams();
  }, []);

  const calculateScore = (attempt: ExamAttempt) => {
    return attempt.score;
  };

  const formatTime = (seconds: number) => {
    if (!seconds) return "0 min";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}min ${s}s`;
    if (m > 0) return `${m}min ${s}s`;
    return `${s}s`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-domain-dl";
    if (score >= 60) return "text-domain-ai";
    return "text-domain-ml";
  };

  const calculateStats = () => {
    if (exams.length === 0) {
      return { count: 0, average: 0, best: 0, totalAttempts: 0 };
    }

    const allAttempts = exams.flatMap(e => e.attempts);
    const count = exams.length;
    const totalAttempts = allAttempts.length;
    const average = totalAttempts > 0
      ? Math.round(allAttempts.reduce((a, b) => a + b.score, 0) / totalAttempts)
      : 0;
    const best = Math.max(...allAttempts.map(a => a.score), 0);

    return { count, average, best, totalAttempts };
  };

  const handleRetakeExam = async (exam: SavedExam) => {
    console.log('[Exams] Retaking exam:', exam.id);

    try {
      await indexedDBService.init();

      // Reuse the saved questions (just shuffle them for variety)
      const shuffledQuestions = [...exam.questions].sort(() => Math.random() - 0.5);
      console.log('[Exams] Reusing', shuffledQuestions.length, 'saved questions');

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

      console.log('[Exams] Session created, navigating to quiz...');
      // Use direct navigation to avoid RSC prefetch which fails offline
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Exams] Failed to retake exam:', error);
      alert(`Erreur: ${error.message || "Erreur inconnue"}`);
    }
  };

  const handleViewDetails = (exam: SavedExam) => {
    if (exam.attempts.length > 0) {
      const bestAttempt = exam.attempts.find(a => a.id === exam.bestAttemptId) || exam.attempts[0];
      // Create a temporary session for viewing
      const sessionId = `exam-view-${Date.now()}`;
      indexedDBService.saveSession({
        id: sessionId,
        type: "exam",
        domain: exam.domain,
        questions: bestAttempt.questions,
        userAnswers: bestAttempt.userAnswers,
        currentIndex: 0,
        status: "COMPLETED" as any,
        startedAt: bestAttempt.startedAt,
        completedAt: bestAttempt.completedAt,
        timeLimit: exam.type === "full" ? 7200 : 3600,
        examId: exam.id,
      }).then(() => {
        // Use direct navigation to avoid RSC prefetch which fails offline
        window.location.href = `/quiz?session=${sessionId}`;
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement de l'historique...</p>
        </main>
      </div>
    );
  }

  const stats = calculateStats();

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <PageHeader
          title="Historique des Examens"
          description={`${stats.count} examen${stats.count > 1 ? 's' : ''} créé${stats.count > 1 ? 's' : ''} • ${stats.totalAttempts} tentative${stats.totalAttempts > 1 ? 's' : ''}`}
        />

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Target className="w-8 h-8 text-accent" />
                <div>
                  <p className="font-mono text-2xl font-bold">{stats.count}</p>
                  <p className="font-mono text-xs text-ink-muted">EXAMENS</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <History className="w-8 h-8 text-domain-bigdata" />
                <div>
                  <p className="font-mono text-2xl font-bold">{stats.totalAttempts}</p>
                  <p className="font-mono text-xs text-ink-muted">TENTATIVES</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-domain-dl" />
                <div>
                  <p className="font-mono text-2xl font-bold">{stats.average}%</p>
                  <p className="font-mono text-xs text-ink-muted">MOYENNE</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Trophy className="w-8 h-8 text-domain-ai" />
                <div>
                  <p className="font-mono text-2xl font-bold">{stats.best}%</p>
                  <p className="font-mono text-xs text-ink-muted">MEILLEUR</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Exam List */}
        {exams.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <History className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
              <p className="text-ink-secondary mb-4">
                Aucun examen créé pour le moment
              </p>
              <p className="text-sm text-ink-muted mb-4">
                Créez votre premier examen pour voir votre historique
              </p>
              <Button variant="primary" onClick={() => router.push("/exam")}>
                Créer un Examen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {exams.map((exam) => {
              const attemptsCount = exam.attempts.length;
              const hasBestScore = exam.bestScore > 0;

              return (
                <Card key={exam.id} hoverable>
                  <CardContent>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-mono font-semibold">
                            {exam.name}
                          </h3>
                          {exam.domain && <DomainBadge domain={exam.domain} />}
                          <Badge variant={exam.type === "full" ? "default" : "accent"}>
                            {exam.type === "full" ? "COMPLET" : "DOMAINE"}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            <span>Créé le {new Date(exam.createdAt).toLocaleDateString("fr-FR")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            <span>{exam.questions.length} questions</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <History className="w-4 h-4" />
                            <span>{attemptsCount} tentative{attemptsCount > 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {hasBestScore ? (
                          <>
                            <div className={`font-mono text-3xl font-bold ${getScoreColor(exam.bestScore)}`}>
                              {exam.bestScore}%
                            </div>
                            <p className="font-mono text-xs text-ink-muted">Meilleur score</p>
                          </>
                        ) : (
                          <div className="font-mono text-3xl font-bold text-ink-muted">
                            --
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4 pt-4 border-t border-paper-dark">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleViewDetails(exam)}
                        disabled={!hasBestScore}
                      >
                        Voir Détails
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleRetakeExam(exam)}
                      >
                        Refaire
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
