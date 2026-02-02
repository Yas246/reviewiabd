"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { QuestionCard } from "@/components/features/QuestionCard";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DomainSelector, DomainBadge } from "@/components/features/DomainSelector";
import { Domain, QuestionType, Question } from "@/types";
import { Star, Filter } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";

// ============================================
// FAVORITES PAGE
// View and practice favorited questions
// ============================================

export default function FavoritesPage() {
  const router = useRouter();
  const [favorites, setFavorites] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDomain, setFilterDomain] = useState<Domain | "all">("all");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});

  // Load favorites from IndexedDB on mount
  useEffect(() => {
    const loadFavorites = async () => {
      console.log('[Favorites] Loading favorites from IndexedDB...');
      try {
        await indexedDBService.init();
        const allFavorites = await indexedDBService.getAllFavorites();
        console.log('[Favorites] Loaded', allFavorites.length, 'favorites');

        // Initialize selectedAnswers with the pre-selected correct answers
        const initialSelectedAnswers: Record<string, string> = {};
        allFavorites.forEach((fav: any) => {
          if (fav.selectedAnswerId) {
            initialSelectedAnswers[fav.id] = fav.selectedAnswerId;
            console.log('[Favorites] Pre-selected answer for question:', fav.id, '->', fav.selectedAnswerId);
          }
        });

        setSelectedAnswers(initialSelectedAnswers);
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
    filterDomain === "all"
      ? favorites
      : favorites.filter((f) => f.domain === filterDomain);

  const handleAnswerSelect = (questionId: string, answerId: string) => {
    setSelectedAnswers({ ...selectedAnswers, [questionId]: answerId });
  };

  const handleToggleFavorite = async (question: Question) => {
    console.log('[Favorites] Toggle favorite for question:', question.id);
    try {
      await indexedDBService.removeFavorite(question.id);
      // Refresh favorites list
      const allFavorites = await indexedDBService.getAllFavorites();
      setFavorites(allFavorites);
      console.log('[Favorites] Favorite removed, remaining:', allFavorites.length);
    } catch (error) {
      console.error('[Favorites] Failed to remove favorite:', error);
    }
  };

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

        {/* Filter */}
        <Card className="mb-8">
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <Filter className="w-5 h-5 text-accent" />
              <h3 className="font-mono font-semibold">Filtrer par Domaine</h3>
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
                Tous ({favorites.length})
              </button>
              {Object.values(Domain).map((domain) => (
                <button
                  key={domain}
                  onClick={() => setFilterDomain(domain)}
                  className={`px-4 py-2 rounded border font-mono text-sm transition-colors ${
                    filterDomain === domain
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-paper-dark text-ink-secondary hover:border-accent"
                  }`}
                >
                  {domain.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        {filteredFavorites.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Star className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
              <p className="text-ink-secondary mb-4">
                {filterDomain === "all"
                  ? "Aucune question favorite pour le moment"
                  : "Aucune question favorite dans ce domaine"}
              </p>
              <Button variant="primary" onClick={() => router.push("/practice")}>
                Commencer à Réviser
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {filteredFavorites.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                selectedAnswerId={selectedAnswers[question.id]}
                onAnswerSelect={(id) => handleAnswerSelect(question.id, id)}
                showResult={false}
                isFavorite={true}
                onToggleFavorite={() => handleToggleFavorite(question)}
                questionNumber={undefined}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
