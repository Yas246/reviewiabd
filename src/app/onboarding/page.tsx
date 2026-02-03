"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Key, Check, AlertCircle, Cpu } from "lucide-react";
import { storageService } from "@/services/StorageService";
import { AIProvider } from "@/types";

// ============================================
// ONBOARDING PAGE
// One-time setup for API key and model selection
// ============================================

const AVAILABLE_MODELS = [
  {
    id: "z-ai/glm-4.5-air:free",
    name: "GLM 4.5 Air (Free)",
    free: true,
    provider: "openrouter" as AIProvider,
  },
  {
    id: "openai/gpt-oss-120b:free",
    name: "GPT-OSS 120B (Free)",
    free: true,
    provider: "openrouter" as AIProvider,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    free: true,
    provider: "gemini" as AIProvider,
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    free: true,
    provider: "gemini" as AIProvider,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [provider, setProvider] = useState<AIProvider>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [customOpenRouterModel, setCustomOpenRouterModel] = useState("");
  const [customGeminiModel, setCustomGeminiModel] = useState("");
  const [selectedModel, setSelectedModel] = useState("z-ai/glm-4.5-air:free");
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

  const validateApiKey = (key: string, provider: AIProvider) => {
    if (provider === "gemini") {
      // Google API key format: AIza followed by 33+ alphanumeric characters
      return /^AIza[A-Za-z0-9_-]{33,}$/.test(key);
    } else {
      // OpenRouter API key format
      return key.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(key);
    }
  };

  const handleApiKeyChange = (value: string) => {
    if (provider === "openrouter") {
      setApiKey(value);
      setIsValidKey(validateApiKey(value, provider));
    } else {
      setGeminiApiKey(value);
      setIsValidKey(validateApiKey(value, provider));
    }
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
        apiKey: provider === "openrouter" ? apiKey : "",
        geminiApiKey: provider === "gemini" ? geminiApiKey : "",
        provider,
        model: selectedModel,
        defaultModel: selectedModel,
        customOpenRouterModel: customOpenRouterModel || undefined,
        customGeminiModel: customGeminiModel || undefined,
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

        {/* Step 1: Provider & API Key */}
        {step === 1 && (
          <Card className="animate-fade-in-up">
            <CardContent>
              {/* Provider Selection */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Cpu className="w-6 h-6 text-accent" />
                </div>
                <div className="flex-1">
                  <h2 className="font-mono font-semibold text-lg mb-1">
                    Fournisseur IA
                  </h2>
                  <p className="text-sm text-ink-muted">
                    Choisissez le service pour générer vos questions
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                {/* OpenRouter Option */}
                <label
                  className={`cursor-pointer border-2 rounded-lg p-4 transition-all ${
                    provider === "openrouter"
                      ? "border-accent bg-accent/10"
                      : "border-paper-dark hover:border-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value="openrouter"
                    checked={provider === "openrouter"}
                    onChange={(e) => {
                      setProvider(e.target.value as AIProvider);
                      setIsValidKey(false);
                      setError("");
                      setSelectedModel("z-ai/glm-4.5-air:free");
                    }}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="font-mono font-semibold text-ink-primary mb-1">
                      OpenRouter
                    </div>
                    <div className="text-xs text-ink-muted">
                      Multi-modèles gratuit
                    </div>
                  </div>
                </label>

                {/* Gemini Option */}
                <label
                  className={`cursor-pointer border-2 rounded-lg p-4 transition-all ${
                    provider === "gemini"
                      ? "border-accent bg-accent/10"
                      : "border-paper-dark hover:border-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value="gemini"
                    checked={provider === "gemini"}
                    onChange={(e) => {
                      setProvider(e.target.value as AIProvider);
                      setIsValidKey(false);
                      setError("");
                      setSelectedModel("gemini-2.5-flash");
                    }}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <div className="font-mono font-semibold text-ink-primary mb-1">
                      Google Gemini
                    </div>
                    <div className="text-xs text-ink-muted">
                      Gemini 2.5 Flash
                    </div>
                  </div>
                </label>
              </div>

              {/* API Key Input */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
                  <Key className="w-6 h-6 text-accent" />
                </div>
                <div>
                  <h2 className="font-mono font-semibold text-lg">
                    {provider === "gemini"
                      ? "Clé API Google"
                      : "Clé API OpenRouter"}
                  </h2>
                  <p className="text-sm text-ink-muted">
                    {provider === "gemini"
                      ? "Obtenez votre clé sur aistudio.google.com"
                      : "Obtenez votre clé gratuitement sur openrouter.ai"}
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
                    value={
                      provider === "gemini" ? geminiApiKey : apiKey
                    }
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={
                      provider === "gemini"
                        ? "AIza..."
                        : "sk-or-v1-..."
                    }
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
                    href={
                      provider === "gemini"
                        ? "https://aistudio.google.com/app/apikey"
                        : "https://openrouter.ai/keys"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent text-sm hover:underline"
                  >
                    {provider === "gemini"
                      ? "Obtenir une clé API Google →"
                      : "Obtenir une clé API OpenRouter →"}
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
                {AVAILABLE_MODELS.filter((model) => model.provider === provider).map(
                  (model) => (
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
                  )
                )}

                {/* Custom Model Input - OpenRouter */}
                {provider === "openrouter" && (
                  <div className="mt-4 p-4 border border-paper-dark rounded-lg">
                    <label className="font-mono text-xs text-ink-muted uppercase mb-2 block">
                      Modèle Custom (optionnel)
                    </label>
                    <input
                      type="text"
                      value={customOpenRouterModel}
                      onChange={(e) => setCustomOpenRouterModel(e.target.value)}
                      placeholder="ex: anthropic/claude-3-5-sonnet"
                      className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
                    />
                    <p className="text-xs text-ink-muted mt-2">
                      Entrez l'ID d'un modèle OpenRouter custom. Voir{" "}
                      <a
                        href="https://openrouter.ai/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        la liste complète
                      </a>.
                    </p>
                    {customOpenRouterModel && selectedModel !== customOpenRouterModel && (
                      <button
                        onClick={() => setSelectedModel(customOpenRouterModel)}
                        className="mt-2 text-xs text-accent hover:underline"
                      >
                        Utiliser ce modèle custom
                      </button>
                    )}
                    {selectedModel === customOpenRouterModel && customOpenRouterModel && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs px-2 py-1 bg-accent/10 text-accent rounded">
                        <span>CUSTOM</span>
                        <span>✓</span>
                      </span>
                    )}
                  </div>
                )}

                {/* Custom Model Input - Gemini */}
                {provider === "gemini" && (
                  <div className="mt-4 p-4 border border-paper-dark rounded-lg">
                    <label className="font-mono text-xs text-ink-muted uppercase mb-2 block">
                      Modèle Custom (optionnel)
                    </label>
                    <input
                      type="text"
                      value={customGeminiModel}
                      onChange={(e) => setCustomGeminiModel(e.target.value)}
                      placeholder="ex: gemini-1.5-pro"
                      className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
                    />
                    <p className="text-xs text-ink-muted mt-2">
                      Entrez l'ID d'un modèle Gemini custom. Voir{" "}
                      <a
                        href="https://ai.google.dev/gemini-api/docs/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
                      >
                        la documentation Gemini
                      </a>.
                    </p>
                    {customGeminiModel && selectedModel !== customGeminiModel && (
                      <button
                        onClick={() => setSelectedModel(customGeminiModel)}
                        className="mt-2 text-xs text-accent hover:underline"
                      >
                        Utiliser ce modèle custom
                      </button>
                    )}
                    {selectedModel === customGeminiModel && customGeminiModel && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs px-2 py-1 bg-accent/10 text-accent rounded">
                        <span>CUSTOM</span>
                        <span>✓</span>
                      </span>
                    )}
                  </div>
                )}
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
