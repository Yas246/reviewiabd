"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DomainSelector } from "@/components/features/DomainSelector";
import { QuestionCounter } from "@/components/features/QuestionCounter";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { Domain, Question } from "@/types";
import { Loader2, Play } from "lucide-react";
import { openRouterService } from "@/services/OpenRouterService";
import { indexedDBService } from "@/services/IndexedDBService";
import { storageService } from "@/services/StorageService";
import { notificationService } from "@/services/NotificationService";

// ============================================
// PRACTICE PAGE
// Select domain and number of questions, then generate
// ============================================

export default function PracticePage() {
  const router = useRouter();
  const [selectedDomain, setSelectedDomain] = useState<Domain>(Domain.MACHINE_LEARNING);
  const [questionCount, setQuestionCount] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generatedQuestions, setGeneratedQuestions] = useState(0);

  const handleGenerate = async () => {
    console.log('[Practice] Generate button clicked');
    console.log('[Practice] Configuration:', {
      domain: selectedDomain,
      questionCount,
      timestamp: new Date().toISOString()
    });

    setIsGenerating(true);
    setProgress(0);
    setGeneratedQuestions(0);

    let taskId: string | undefined;

    try {
      console.log('[Practice] Initializing IndexedDB...');
      // Ensure IndexedDB is initialized
      await indexedDBService.init();
      console.log('[Practice] IndexedDB initialized successfully');

      // Check if notifications are enabled
      const settings = await storageService.getSettings();
      const notificationsEnabled = settings?.notifyOnComplete ?? false;

      // Create background task if notifications are enabled
      if (notificationsEnabled) {
        taskId = await notificationService.createBackgroundTask(
          'quiz-generation',
          selectedDomain,
          questionCount
        );
        await notificationService.updateTaskStatus(taskId!, 'generating');
        console.log('[Practice] Created background task:', taskId);
      }

      console.log('[Practice] Starting question generation...');
      // Generate questions using OpenRouter service
      const questions = await openRouterService.generateQuestions(
        {
          domain: selectedDomain,
          count: questionCount,
          includeExplanations: true,
        },
        (progressData) => {
          // Progress callback
          setGeneratedQuestions(progressData.current);
          setProgress((progressData.current / progressData.total) * 100);
        }
      );

      console.log('[Practice] Generation completed, received', questions.length, 'questions');
      console.log('[Practice] Saving session to IndexedDB...');

      // Store questions in IndexedDB for the quiz session
      const sessionId = `practice-${Date.now()}`;
      await indexedDBService.saveSession({
        id: sessionId,
        type: "practice",
        domain: selectedDomain,
        questions,
        userAnswers: {},
        currentIndex: 0,
        status: "IN_PROGRESS" as any,
        startedAt: new Date(),
      });

      // Update background task and send notification
      if (taskId && notificationsEnabled) {
        await notificationService.updateTaskStatus(taskId, 'ready', sessionId);
        console.log('[Practice] Background task updated and notification sent');
      }

      console.log('[Practice] Session saved with ID:', sessionId);
      console.log('[Practice] Navigating to quiz page...');
      // Navigate to quiz page with session ID
      // Use direct navigation to avoid RSC prefetch which fails offline
      window.location.href = `/quiz?session=${sessionId}`;
    } catch (error: any) {
      console.error('[Practice] ERROR during generation:', error);
      console.error('[Practice] Error details:', {
        message: error.message,
        code: error.code,
        isRetryable: error.isRetryable,
        stack: error.stack
      });

      // Update background task with error
      if (taskId) {
        await notificationService.updateTaskStatus(
          taskId,
          'failed',
          undefined,
          error.message || "Erreur inconnue"
        );
      }

      setIsGenerating(false);
      setProgress(0);
      setGeneratedQuestions(0);
      // TODO: Show error toast/notification
      alert(`Erreur lors de la génération: ${error.message || "Erreur inconnue"}`);
    }
  };

  const canStart = selectedDomain && questionCount >= 5 && !isGenerating;

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
        <PageHeader
          title="Mode Pratique"
          description="Configurez votre session de révision"
        />

        {/* Configuration Card */}
        <Card className="mb-8">
          <CardContent>
            <div className="space-y-8">
              {/* Domain Selection */}
              <div>
                <h3 className="font-mono font-semibold mb-4">01. Domaine IABD</h3>
                <DomainSelector
                  value={selectedDomain}
                  onChange={setSelectedDomain}
                  variant="grid"
                />
              </div>

              {/* Question Count */}
              <div>
                <h3 className="font-mono font-semibold mb-4">
                  02. Nombre de Questions
                </h3>
                <QuestionCounter
                  value={questionCount}
                  onChange={setQuestionCount}
                />
              </div>

              {/* Summary */}
              <div className="border-t border-paper-dark pt-6">
                <h3 className="font-mono font-semibold mb-4">Résumé</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Domaine
                    </span>
                    <p className="font-medium mt-1">{selectedDomain.replace(/_/g, " ")}</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Questions
                    </span>
                    <p className="font-medium mt-1">{questionCount}</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Batches
                    </span>
                    <p className="font-medium mt-1">{Math.ceil(questionCount / 10)}</p>
                  </div>
                  <div>
                    <span className="font-mono text-xs text-ink-muted uppercase">
                      Durée estimée
                    </span>
                    <p className="font-medium mt-1">{~Math.ceil(questionCount / 2)} min</p>
                  </div>
                </div>
              </div>

              {/* Progress Bar (during generation) */}
              {isGenerating && (
                <div className="border-t border-paper-dark pt-6">
                  <h3 className="font-mono font-semibold mb-4">Génération en cours...</h3>
                  <ProgressBar
                    value={progress}
                    showLabel
                    label="Questions générées"
                  />
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
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={!canStart}
            loading={isGenerating}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Générer et Commencer
              </>
            )}
          </Button>
        </div>

        {/* Info Box */}
        <Card className="mt-8 border-l-4 border-l-accent">
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-accent" />
                <h3 className="font-mono font-semibold text-sm">Comment ça marche ?</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      1
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Les questions sont générées par lots de <span className="font-mono text-accent">10</span>
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      2
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Commencez avant que toutes les questions soient prêtes
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      3
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Pas de limite de temps en mode Pratique
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <div className="w-5 h-5 rounded-full bg-accent/10 flex items-center justify-center text-xs font-mono text-accent">
                      4
                    </div>
                  </div>
                  <p className="text-sm text-ink-secondary flex-1">
                    Marquez vos questions favorites pour les réviser
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
