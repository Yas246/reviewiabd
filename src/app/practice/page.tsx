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

    try {
      console.log('[Practice] Initializing IndexedDB...');
      // Ensure IndexedDB is initialized
      await indexedDBService.init();
      console.log('[Practice] IndexedDB initialized successfully');

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

      console.log('[Practice] Session saved with ID:', sessionId);
      console.log('[Practice] Navigating to quiz page...');
      // Navigate to quiz page with session ID
      router.push(`/quiz?session=${sessionId}`);
    } catch (error: any) {
      console.error('[Practice] ERROR during generation:', error);
      console.error('[Practice] Error details:', {
        message: error.message,
        code: error.code,
        isRetryable: error.isRetryable,
        stack: error.stack
      });
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
        <Card className="mt-8">
          <CardContent>
            <div className="flex gap-3">
              <Badge variant="warning">INFO</Badge>
              <div className="text-sm text-ink-secondary">
                <p className="font-medium mb-1">Comment ça marche ?</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Les questions sont générées par lots de 10</li>
                  <li>Vous pouvez commencer avant que toutes les questions soient prêtes</li>
                  <li>Pas de limite de temps en mode Pratique</li>
                  <li>Marquez vos questions favorites pour les réviser plus tard</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
