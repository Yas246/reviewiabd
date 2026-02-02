"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DomainSelector } from "@/components/features/DomainSelector";
import { Badge } from "@/components/ui/Badge";
import { Domain, SavedExercise } from "@/types";
import { Download, Wifi, WifiOff, CheckCircle } from "lucide-react";
import { indexedDBService } from "@/services/IndexedDBService";
import { openRouterService } from "@/services/OpenRouterService";

// ============================================
// OFFLINE PAGE
// Generate and manage offline exercises
// ============================================

export default function OfflinePage() {
  const router = useRouter();
  const [selectedDomain, setSelectedDomain] = useState<Domain>(Domain.MACHINE_LEARNING);
  const [exercises, setExercises] = useState<SavedExercise[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [questionCount] = useState(10);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const loadExercises = async () => {
      console.log('[Offline] Loading exercises from IndexedDB...');
      try {
        await indexedDBService.init();
        const allExercises = await indexedDBService.getAllExercises();
        console.log('[Offline] Loaded', allExercises.length, 'exercises');
        setExercises(allExercises);
        setLoading(false);
      } catch (error) {
        console.error('[Offline] Failed to load exercises:', error);
        setLoading(false);
      }
    };

    loadExercises();
  }, []);

  // Detect online/offline status
  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Listen for connection changes
    const handleOnline = () => {
      console.log('[Offline] Connection status: ONLINE');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[Offline] Connection status: OFFLINE');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleGenerate = async () => {
    console.log('[Offline] Generating offline exercises for domain:', selectedDomain);
    setIsGenerating(true);

    try {
      await indexedDBService.init();

      console.log('[Offline] Starting question generation...');
      const questions = await openRouterService.generateQuestions({
        domain: selectedDomain,
        count: questionCount,
        includeExplanations: true,
      });

      console.log('[Offline] Generated', questions.length, 'questions');

      const exercise: SavedExercise = {
        id: `offline-${selectedDomain}-${Date.now()}`,
        domain: selectedDomain,
        questions,
        used: false,
        createdAt: new Date(),
      };

      await indexedDBService.saveExercise(exercise);
      console.log('[Offline] Exercise saved:', exercise.id);

      // Refresh exercises list
      const allExercises = await indexedDBService.getAllExercises();
      setExercises(allExercises);

      alert(`${questions.length} questions générées et prêtes à être utilisées hors ligne !`);
    } catch (error: any) {
      console.error('[Offline] Failed to generate exercises:', error);
      alert(`Erreur lors de la génération: ${error.message || "Erreur inconnue"}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartExercise = async (exerciseId: string) => {
    console.log('[Offline] Starting exercise:', exerciseId);

    try {
      const exercise = await indexedDBService.getExercise(exerciseId);
      if (!exercise) {
        alert("Exercice introuvable");
        return;
      }

      // Mark as used
      await indexedDBService.markExerciseUsed(exerciseId);

      // Create session
      const sessionId = `offline-${Date.now()}`;
      await indexedDBService.saveSession({
        id: sessionId,
        type: "offline",
        domain: exercise.domain,
        questions: exercise.questions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
      });

      console.log('[Offline] Session created:', sessionId);
      // Use direct navigation to avoid RSC prefetch which fails offline
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error) {
      console.error('[Offline] Failed to start exercise:', error);
      alert("Erreur lors du démarrage de l'exercice");
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!confirm("Supprimer cet exercice hors ligne ?")) return;

    try {
      await indexedDBService.deleteExercise(exerciseId);
      const allExercises = await indexedDBService.getAllExercises();
      setExercises(allExercises);
      console.log('[Offline] Exercise deleted:', exerciseId);
    } catch (error) {
      console.error('[Offline] Failed to delete exercise:', error);
      alert("Erreur lors de la suppression");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement des exercices...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12">
        <PageHeader
          title="Mode Hors Ligne"
          description="Générez des exercices pour réviser sans connexion"
        />

        {/* Connection Status */}
        <Card className="mb-8">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              {isOnline ? (
                <>
                  <Wifi className="w-5 h-5 text-domain-dl" />
                  <div>
                    <p className="font-medium text-sm">Connecté à Internet</p>
                    <p className="text-xs text-ink-muted">
                      Vous pouvez générer de nouveaux exercices
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-domain-ml" />
                  <div>
                    <p className="font-medium text-sm">Hors Ligne</p>
                    <p className="text-xs text-ink-muted">
                      Utilisez les exercices téléchargés
                    </p>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Generate New Exercises */}
        <Card className="mb-8">
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <Download className="w-5 h-5 text-accent" />
              <h3 className="font-mono font-semibold">Générer des Exercices</h3>
            </div>

            <div className="mb-6">
              <p className="text-sm text-ink-muted mb-4">
                Sélectionnez un domaine pour générer {questionCount} questions utilisables hors ligne
              </p>
              <DomainSelector
                value={selectedDomain}
                onChange={setSelectedDomain}
                variant="dropdown"
              />
            </div>

            <Button
              variant="primary"
              className="w-full"
              onClick={handleGenerate}
              loading={isGenerating}
              disabled={isGenerating || !isOnline}
            >
              <Download className="w-4 h-4 mr-2" />
              {isOnline ? "Générer pour Hors Ligne" : "Hors Ligne - Non disponible"}
            </Button>
          </CardContent>
        </Card>

        {/* Available Exercises */}
        <div>
          <h3 className="font-mono font-semibold mb-4 flex items-center gap-3">
            <WifiOff className="w-5 h-5" />
            Exercices Disponibles ({exercises.length})
          </h3>

          {exercises.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <WifiOff className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
                <p className="text-ink-secondary mb-4">
                  Aucun exercice hors ligne pour le moment
                </p>
                <p className="text-sm text-ink-muted">
                  Générez des exercices pour les utiliser sans connexion Internet
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exercises.map((exercise) => (
                <Card key={exercise.id} hoverable>
                  <CardContent>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <CardTitle className="text-base">
                          {exercise.domain.replace(/_/g, " ")}
                        </CardTitle>
                        <p className="text-sm text-ink-muted">
                          {exercise.questions.length} questions
                        </p>
                      </div>
                      <Badge variant={exercise.used ? "default" : "success"}>
                        {exercise.used ? "Utilisé" : <><CheckCircle className="w-3 h-3 mr-1" />Prêt</>}
                      </Badge>
                    </div>

                    <p className="font-mono text-xs text-ink-muted mb-4">
                      Ajouté le {new Date(exercise.createdAt).toLocaleDateString("fr-FR")}
                    </p>

                    <div className="flex gap-2">
                      <Button
                        variant="primary"
                        className="flex-1"
                        size="sm"
                        onClick={() => handleStartExercise(exercise.id)}
                      >
                        Commencer
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDeleteExercise(exercise.id)}
                      >
                        Supprimer
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
