"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Question, QuizSession, SavedExam } from "@/types";
import { Clock, FileText, Play, ScrollText } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";

// ============================================
// MOCK EXAMS PAGE (épreuves réelles)
// Les vrais sujets d'examen IABD transcrits,
// rejouables dans les conditions du réel avec
// corrigé détaillé intégré.
// ============================================

interface MockExamMeta {
  id: string;
  title: string;
  description: string;
  durationSeconds: number;
  mode: "exam" | "practice";
  questions: Question[];
}

const MOCK_EXAMS: { file: string }[] = [
  { file: "/exams/TRONC_COMMUN.json" },
  { file: "/exams/SPECIALITE.json" },
  { file: "/exams/PRATIQUE_PRO.json" },
];

export default function MockExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<MockExamMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, { best: number; attempts: number }>>({});

  useEffect(() => {
    const load = async () => {
      try {
        await indexedDBService.init();
        const loaded: MockExamMeta[] = [];
        for (const { file } of MOCK_EXAMS) {
          const res = await fetch(file);
          if (res.ok) loaded.push(await res.json());
        }
        setExams(loaded);

        // Historique : les SavedExam mock-*
        const allExams = await indexedDBService.getAllExams();
        const hist: Record<string, { best: number; attempts: number }> = {};
        allExams.forEach((e) => {
          if (e.mockExamId) {
            hist[e.mockExamId] = { best: e.bestScore, attempts: e.attempts.length };
          }
        });
        setHistory(hist);
        setLoading(false);
      } catch (error) {
        console.error("[MockExams] Load failed:", error);
        setLoading(false);
      }
    };
    load();
  }, []);

  const startExam = async (mock: MockExamMeta) => {
    setStarting(mock.id);
    try {
      await indexedDBService.init();

      if (mock.mode === "exam") {
        const examId = `mock-session-${mock.id}-${Date.now()}`;
        const savedExamId = `mock-${mock.id}`;

        // Un seul SavedExam par épreuve réelle (pour l'historique)
        let savedExam = await indexedDBService.getExam(savedExamId);
        if (!savedExam) {
          const fresh: SavedExam = {
            id: savedExamId,
            name: mock.title,
            type: "full",
            questions: mock.questions,
            attempts: [],
            bestScore: 0,
            bestAttemptId: "",
            createdAt: new Date(),
            lastAttemptAt: new Date(),
            mockExamId: mock.id,
          };
          await indexedDBService.saveExam(fresh);
          savedExam = fresh;
        }

        const sessionId = examId;
        await indexedDBService.saveSession({
          id: sessionId,
          type: "exam",
          questions: mock.questions,
          userAnswers: {},
          currentIndex: 0,
          status: "IN_PROGRESS" as any,
          startedAt: new Date(),
          timeLimit: mock.durationSeconds,
          examId: savedExamId,
          mockExamId: mock.id,
          label: mock.title,
        });
        window.location.href = `/quiz?session=${sessionId}`;
      } else {
        // Cas pratique : mode pratique (corrigé + auto-évaluation)
        const sessionId = `mock-practice-${mock.id}-${Date.now()}`;
        await indexedDBService.saveSession({
          id: sessionId,
          type: "practice",
          questions: mock.questions,
          userAnswers: {},
          currentIndex: 0,
          status: "IN_PROGRESS" as any,
          startedAt: new Date(),
          label: mock.title,
        });
        window.location.href = `/quiz?session=${sessionId}`;
      }
    } catch (error: any) {
      console.error("[MockExams] Start failed:", error);
      setStarting(null);
      alert(`Erreur : ${error.message || "Erreur inconnue"}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement des épreuves...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-12">
        <PageHeader
          title="Épreuves réelles"
          description="Les vrais sujets d'examen IABD, rejouables dans les conditions du réel"
          actions={
            <Button variant="secondary" size="sm" onClick={() => router.back()}>
              Retour
            </Button>
          }
        />

        <div className="space-y-6">
          {exams.map((mock) => {
            const hist = history[mock.id];
            const durationMin = Math.round(mock.durationSeconds / 60);
            return (
              <Card key={mock.id} hoverable>
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded bg-accent/10 flex items-center justify-center shrink-0">
                      {mock.mode === "exam" ? (
                        <ScrollText className="w-6 h-6 text-accent" />
                      ) : (
                        <FileText className="w-6 h-6 text-accent" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="font-mono font-semibold">{mock.title}</h3>
                        {mock.mode === "exam" ? (
                          <Badge variant="default">QCM chronométré</Badge>
                        ) : (
                          <Badge variant="default">cas pratique corrigé</Badge>
                        )}
                      </div>
                      <p className="text-sm text-ink-secondary mb-3">{mock.description}</p>
                      <div className="flex items-center gap-4 text-sm text-ink-muted mb-4">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-4 h-4" />
                          {durationMin} min
                        </span>
                        <span className="font-mono">
                          {mock.questions.length} dossier
                          {mock.questions.length > 1 ? "s" : ""} / question
                          {mock.questions.length > 1 ? "s" : ""}
                        </span>
                        {hist && (
                          <span className="font-mono">
                            meilleur score : {hist.best}% ({hist.attempts} tentative
                            {hist.attempts > 1 ? "s" : ""})
                          </span>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => startExam(mock)}
                        loading={starting === mock.id}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Commencer l&apos;épreuve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-ink-muted mt-8 text-center">
          QCM : correction masquée pendant l&apos;épreuve, note à la fin avec corrigé détaillé.
          Cas pratiques : tu rédiges, puis le corrigé s&apos;affiche point par point avec
          auto-évaluation.
        </p>
      </main>
    </div>
  );
}
