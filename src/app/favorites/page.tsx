"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Domain, Question, DOMAIN_LABELS } from "@/types";
import { Star, Filter, Play } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { questionBank } from "@/services/QuestionBankService";
import { shuffleArray } from "@/lib/utils";

// ============================================
// FAVORITES PAGE
// Consultation + mode quiz : « Réviser mes
// favoris » lance une session notée sur les
// questions marquées (sans réponse présélectionnée).
// ============================================

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDomain, setFilterDomain] = useState<Domain | "all">("all");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const loadFavorites = async () => {
      try {
        await indexedDBService.init();
        const allFavorites = await indexedDBService.getAllFavorites();
        setFavorites(allFavorites);
        setLoading(false);
      } catch (error) {
        console.error('[Favorites] Failed to load favorites:', error);
        setLoading(false);
      }
    };

    loadFavorites();
  }, []);

  const filteredFavorites =
    filterDomain === "all" ? favorites : favorites.filter((f) => f.domain === filterDomain);

  const handleToggleFavorite = async (question: Question) => {
    try {
      await indexedDBService.removeFavorite(question.id);
      const allFavorites = await indexedDBService.getAllFavorites();
      setFavorites(allFavorites);
    } catch (error) {
      console.error('[Favorites] Failed to remove favorite:', error);
    }
  };

  const handleQuizFavorites = async () => {
    if (filteredFavorites.length < 1) return;
    setStarting(true);
    try {
      await indexedDBService.init();
      const questions = shuffleArray(
        filteredFavorites.map((q) => questionBank.shuffleQuestionAnswers(q))
      );
      const sessionId = `favorites-${Date.now()}`;
      await indexedDBService.saveSession({
        id: sessionId,
        type: "favorites",
        domain: filterDomain === "all" ? undefined : filterDomain,
        questions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
        label: `Révision des favoris (${questions.length})`,
      });
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Favorites] Quiz start failed:', error);
      setStarting(false);
      alert(`Erreur : ${error.message || "Erreur inconnue"}`);
    }
  };

  const domainsInFavorites = Array.from(new Set(favorites.map((f) => f.domain)));

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement des favoris...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <PageHeader
          title="Questions Favorites"
          description={`${favorites.length} questions marquées`}
          actions={
            <Button variant="secondary" size="sm" onClick={() => router.back()}>
              Retour
            </Button>
          }
        />

        {/* Mode quiz sur les favoris */}
        {filteredFavorites.length > 0 && (
          <Card className="mb-8 border-l-4 border-l-accent">
            <CardContent>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-mono font-semibold mb-1">Se tester sur ses favoris</h3>
                  <p className="text-sm text-ink-muted">
                    Session notée de {filteredFavorites.length} question
                    {filteredFavorites.length > 1 ? "s" : ""} : les options sont mélangées,
                    les erreurs partent au cahier d&apos;erreurs.
                  </p>
                </div>
                <Button variant="primary" onClick={handleQuizFavorites} loading={starting}>
                  <Play className="w-4 h-4" />
                  Réviser mes favoris
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter */}
        {favorites.length > 0 && (
          <Card className="mb-8">
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Filter className="w-5 h-5 text-accent" />
                <h3 className="font-mono font-semibold">Filtrer par Matière</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterDomain("all")}
                  className={`px-4 py-2 rounded border font-mono text-sm transition-colors ${
                    filterDomain === "all"
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-paper-dark text-ink-secondary hover:border-accent"
                  }`}
                >
                  Toutes ({favorites.length})
                </button>
                {domainsInFavorites.map((domain) => (
                  <button
                    key={domain}
                    onClick={() => setFilterDomain(domain)}
                    className={`px-4 py-2 rounded border font-mono text-sm transition-colors ${
                      filterDomain === domain
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-paper-dark text-ink-secondary hover:border-accent"
                    }`}
                  >
                    {DOMAIN_LABELS[domain]?.split(" ")[0] || domain} (
                    {favorites.filter((f) => f.domain === domain).length})
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Questions */}
        {filteredFavorites.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Star className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
              <p className="text-ink-secondary mb-4">
                {filterDomain === "all"
                  ? "Aucune question favorite pour le moment"
                  : "Aucune question favorite dans cette matière"}
              </p>
              <p className="text-sm text-ink-muted mb-4">
                Marque des questions avec l&apos;étoile pendant un quiz pour les retrouver ici.
              </p>
              <Button variant="primary" onClick={() => router.push("/practice")}>
                Commencer à Réviser
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredFavorites.map((question) => (
              <div key={question.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="default">{DOMAIN_LABELS[question.domain]?.split(" ")[0] || question.domain}</Badge>
                      <span className="font-mono text-xs text-ink-muted">{question.difficulty}</span>
                    </div>
                    <p className="font-serif">{question.question}</p>
                    <details className="mt-3">
                      <summary className="font-mono text-xs text-accent cursor-pointer uppercase">
                        Voir la réponse
                      </summary>
                      <p className="mt-2 text-sm text-ink-secondary">
                        {question.answers.filter((a) => a.isCorrect).map((a) => a.text).join("  •  ")}
                      </p>
                      {question.explanation && (
                        <p className="mt-2 text-xs text-ink-muted italic font-serif">
                          {question.explanation}
                        </p>
                      )}
                    </details>
                  </div>
                  <button
                    onClick={() => handleToggleFavorite(question)}
                    className="p-2 rounded text-accent hover:text-ink-muted transition-colors"
                    aria-label="Retirer des favoris"
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
