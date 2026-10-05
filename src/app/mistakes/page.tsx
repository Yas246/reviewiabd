"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DOMAIN_LABELS } from "@/types";
import { AlertCircle, Play, CheckCircle2, Trash2, Repeat } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { mistakesService } from "@/services/MistakesService";
import { questionBank } from "@/services/QuestionBankService";
import { shuffleArray } from "@/lib/utils";
import { MistakeEntry } from "@/types";
import { formatShortDate } from "@/lib/utils";

// ============================================
// MISTAKES PAGE (cahier d'erreurs)
// Toutes les questions ratées, avec répétition
// espacée : « Réviser maintenant » rejoue les
// questions dues. 2 bonnes réponses de suite =
// question maîtrisée.
// ============================================

export default function MistakesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, mastered: 0, dueNow: 0, byDomain: {} as Record<string, number> });
  const [mistakes, setMistakes] = useState<MistakeEntry[]>([]);
  const [showMastered, setShowMastered] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = async () => {
    try {
      await indexedDBService.init();
      const [s, all] = await Promise.all([mistakesService.getStats(), indexedDBService.getAllMistakes()]);
      setStats(s);
      setMistakes(all.sort((a, b) => new Date(a.srs.dueAt).getTime() - new Date(b.srs.dueAt).getTime()));
      setLoading(false);
    } catch (error) {
      console.error('[Mistakes] Load failed:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startReview = async (onlyDue: boolean) => {
    setStarting(true);
    try {
      await indexedDBService.init();
      const entries = onlyDue ? await mistakesService.getDue(20) : mistakes.filter((m) => !m.mastered).slice(0, 30);
      if (entries.length === 0) {
        alert("Aucune erreur à réviser pour le moment. Bravo !");
        setStarting(false);
        return;
      }
      const questions = shuffleArray(entries.map((m) => questionBank.shuffleQuestionAnswers(m.question)));
      const sessionId = `mistakes-${Date.now()}`;
      await indexedDBService.saveSession({
        id: sessionId,
        type: "mistakes",
        questions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
        label: onlyDue ? `Révision du jour (${questions.length})` : `Cahier d'erreurs (${questions.length})`,
      });
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Mistakes] Review start failed:', error);
      setStarting(false);
      alert(`Erreur : ${error.message || "Erreur inconnue"}`);
    }
  };

  const toggleMastered = async (entry: MistakeEntry) => {
    await mistakesService.markMastered(entry.id, !entry.mastered);
    await load();
  };

  const remove = async (entry: MistakeEntry) => {
    if (!confirm("Retirer cette question du cahier d'erreurs ?")) return;
    await mistakesService.remove(entry.id);
    await load();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement du cahier d'erreurs...</p>
        </main>
      </div>
    );
  }

  const visible = showMastered ? mistakes : mistakes.filter((m) => !m.mastered);

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <PageHeader
          title="Cahier d'erreurs"
          description="Chaque erreur est notée et revient au bon moment (répétition espacée)"
          actions={
            <Button variant="secondary" size="sm" onClick={() => router.back()}>
              Retour
            </Button>
          }
        />

        {/* Résumé */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="text-center py-4">
              <div className="font-mono text-2xl font-bold text-accent">{stats.dueNow}</div>
              <p className="font-mono text-xs text-ink-muted uppercase mt-1">à réviser aujourd'hui</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-4">
              <div className="font-mono text-2xl font-bold">{stats.active}</div>
              <p className="font-mono text-xs text-ink-muted uppercase mt-1">en cours</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-4">
              <div className="font-mono text-2xl font-bold text-domain-dl">{stats.mastered}</div>
              <p className="font-mono text-xs text-ink-muted uppercase mt-1">maîtrisées</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-4">
              <div className="font-mono text-2xl font-bold">{stats.total}</div>
              <p className="font-mono text-xs text-ink-muted uppercase mt-1">au total</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        {stats.total > 0 && (
          <div className="flex gap-4 justify-center mb-8">
            <Button variant="primary" onClick={() => startReview(true)} loading={starting} disabled={stats.dueNow === 0}>
              <Play className="w-4 h-4" />
              Réviser les {stats.dueNow} dues
            </Button>
            <Button variant="secondary" onClick={() => startReview(false)} loading={starting}>
              <Repeat className="w-4 h-4 mr-2" />
              Tout revoir (non maîtrisées)
            </Button>
          </div>
        )}

        {/* Liste */}
        {visible.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-domain-dl" />
              <p className="text-ink-secondary mb-2">
                {stats.total === 0
                  ? "Cahier d'erreurs vide"
                  : "Toutes tes erreurs sont maîtrisées, bravo !"}
              </p>
              <p className="text-sm text-ink-muted mb-4">
                Chaque question ratée pendant un quiz atterrit ici automatiquement.
              </p>
              <Button variant="primary" onClick={() => router.push("/practice")}>
                Commencer à Réviser
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((m) => {
              const due = new Date(m.srs.dueAt).getTime() <= Date.now();
              return (
                <Card key={m.id}>
                  <CardContent>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="default">
                            {DOMAIN_LABELS[m.question.domain]?.split(" ")[0] || m.question.domain}
                          </Badge>
                          {m.mastered ? (
                            <Badge variant="success">maîtrisée</Badge>
                          ) : due ? (
                            <Badge variant="warning">à réviser</Badge>
                          ) : (
                            <Badge variant="default">revient le {formatShortDate(new Date(m.srs.dueAt))}</Badge>
                          )}
                          <span className="font-mono text-xs text-ink-muted">
                            ratée {m.missedCount}× • série {m.correctStreak}
                          </span>
                        </div>
                        <p className="font-serif text-sm line-clamp-2">{m.question.question}</p>
                        <details className="mt-2">
                          <summary className="font-mono text-xs text-accent cursor-pointer uppercase">
                            Voir la réponse
                          </summary>
                          <p className="mt-2 text-sm text-ink-secondary">
                            {m.question.answers.filter((a) => a.isCorrect).map((a) => a.text).join("  •  ")}
                          </p>
                          {m.question.explanation && (
                            <p className="mt-2 text-xs text-ink-muted italic font-serif">
                              {m.question.explanation}
                            </p>
                          )}
                        </details>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => toggleMastered(m)}
                          title={m.mastered ? "Remettre en révision" : "Marquer comme maîtrisée"}
                          className="p-2 rounded text-ink-muted hover:text-domain-dl transition-colors"
                          aria-label="Maîtrisée"
                        >
                          <CheckCircle2 className={`w-5 h-5 ${m.mastered ? "text-domain-dl" : ""}`} />
                        </button>
                        <button
                          onClick={() => remove(m)}
                          title="Retirer du cahier"
                          className="p-2 rounded text-ink-muted hover:text-domain-ml transition-colors"
                          aria-label="Supprimer"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!showMastered && stats.mastered > 0 && (
              <div className="text-center pt-4">
                <Button variant="secondary" size="sm" onClick={() => setShowMastered(true)}>
                  Afficher les {stats.mastered} maîtrisée{stats.mastered > 1 ? "s" : ""}
                </Button>
              </div>
            )}
            {showMastered && (
              <div className="text-center pt-4">
                <Button variant="secondary" size="sm" onClick={() => setShowMastered(false)}>
                  Masquer les maîtrisées
                </Button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
