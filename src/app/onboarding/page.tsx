"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Key, Check, AlertCircle } from "lucide-react";
import { storageService } from "@/services/StorageService";

// ============================================
// ONBOARDING PAGE
// One-time setup for API key and model selection
// ============================================

const AVAILABLE_MODELS = [
  { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 Air (Free)", free: true },
  { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B (Free)", free: true },
  { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B (Free)", free: true },
  {
    id: "meta-llama/llama-3.3-8b-instruct:free",
    name: "Llama 3.3 8B (Free)",
    free: true,
  },
  { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", free: false },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", free: false },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState(
    "z-ai/glm-4.5-air:free",
  );
  const [isValidKey, setIsValidKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);

  useEffect(() => {
    // Check if onboarding is already completed
    const checkOnboarding = async () => {
      const completed = await storageService.isOnboardingCompleted();
      if (completed) {
        router.push("/");
      }
    };
    checkOnboarding();
  }, [router]);

  const validateApiKey = (key: string) => {
    return key.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(key);
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setIsValidKey(validateApiKey(value));
    setError("");
  };

  const handleContinue = () => {
    if (step === 1) {
      if (!isValidKey) {
        setError("Please enter a valid API key");
        return;
      }
      setStep(2);
    } else {
      handleComplete();
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError("");

    try {
      // Save settings to StorageService (IndexedDB)
      await storageService.saveSettings({
        apiKey,
        model: selectedModel,
        defaultModel: selectedModel,
        onboardingCompleted: true,
        notifyOnComplete: true,
        offlineQuestionsPerDomain: 10,
        updatedAt: new Date(),
      });

      // Wait a moment to show success state
      await new Promise((resolve) => setTimeout(resolve, 500));

      router.push("/");
    } catch (err) {
      setError("Failed to save settings. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary w-full">
      <Navigation />

      <main className="flex-1 max-w-2xl px-4 py-12 w-full self-center">
        <div className="mb-8 text-center">
          <h1 className="font-mono font-bold text-3xl mb-4">
            Configuration Initiale
          </h1>
          <p className="text-ink-secondary">
            Configurez votre application pour commencer à réviser. Vous ne
            verrez cette page qu&apos;une seule fois.
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 mb-8 w-full">
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full font-mono font-bold border-2 shrink-0 ${
              step >= 1
                ? "bg-accent border-accent text-paper-primary"
                : "border-paper-dark text-ink-muted"
            }`}
          >
            {step > 1 ? <Check className="w-5 h-5" /> : "1"}
          </div>
          <div
            className={`flex-1 h-0.5 min-w-[100px] ${step >= 2 ? "bg-accent" : "bg-paper-dark"}`}
          />
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full font-mono font-bold border-2 shrink-0 ${
              step >= 2
                ? "bg-accent border-accent text-paper-primary"
                : "border-paper-dark text-ink-muted"
            }`}
          >
            2
          </div>
        </div>

        {/* Step 1: API Key */}
        {step === 1 && (
          <Card className="animate-fade-in-up">
            <CardContent>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Key className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h2 className="font-mono font-semibold text-lg">
                    Clé API OpenRouter
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Obtenez votre clé gratuitement sur openrouter.ai
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="font-mono text-xs text-ink-muted uppercase mb-2 block">
                    Clé API
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder="sk-or-v1-..."
                    className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-domain-ml text-sm">
                    <AlertCircle className="w-4 h-4" />
                    <span>{error}</span>
                  </div>
                )}

                {isValidKey && (
                  <div className="flex items-center gap-2 text-domain-dl text-sm">
                    <Check className="w-4 h-4" />
                    <span>Clé API valide</span>
                  </div>
                )}

                <div className="mt-6">
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent text-sm hover:underline"
                  >
                    Obtenir une clé API →
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Model Selection */}
        {step === 2 && (
          <Card className="animate-fade-in-up">
            <CardContent>
              <div className="mb-6">
                <h2 className="font-mono font-semibold text-lg mb-2">
                  Sélection du Modèle
                </h2>
                <p className="text-sm text-ink-muted">
                  Choisissez le modèle IA pour générer vos questions
                </p>
              </div>

              <div className="space-y-3">
                {AVAILABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`w-full p-4 rounded border text-left transition-all ${
                      selectedModel === model.id
                        ? "border-accent bg-accent/10"
                        : "border-paper-dark hover:border-accent/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-medium text-ink-primary">
                            {model.name}
                          </span>
                          {model.free && (
                            <Badge variant="success">GRATUIT</Badge>
                          )}
                        </div>
                        <span className="text-xs text-ink-muted font-mono">
                          {model.id}
                        </span>
                      </div>
                      {selectedModel === model.id && (
                        <Check className="w-5 h-5 text-accent" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4 justify-between mt-12">
          <Button
            variant="secondary"
            onClick={() => setStep(step - 1)}
            disabled={step === 1 || isLoading}
          >
            Retour
          </Button>
          <Button
            variant="primary"
            onClick={handleContinue}
            loading={isLoading}
            disabled={step === 1 && !isValidKey}
          >
            {step === 1 ? "Continuer" : "Terminer"}
          </Button>
        </div>
      </main>
    </div>
  );
}
