"use client";

import { useState, useEffect } from "react";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Key, Cpu, Trash2, Download, Upload } from "lucide-react";
import { storageService } from "@/services/StorageService";
import { indexedDBService } from "@/services/IndexedDBService";
import { notificationService } from "@/services/NotificationService";

// ============================================
// SETTINGS PAGE
// Manage API key, model, and preferences
// ============================================

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState("z-ai/glm-4.5-air:free");
  const [notifications, setNotifications] = useState(true);
  const [offlineQuestions, setOfflineQuestions] = useState(10);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [models] = useState(storageService.getAvailableModels());

  useEffect(() => {
    const loadSettings = async () => {
      console.log('[Settings] Loading settings...');
      try {
        // Initialize notification service
        await notificationService.init();

        const settings = await storageService.getSettings();
        if (settings) {
          setApiKey(settings.apiKey || "");
          setSelectedModel(settings.model || "z-ai/glm-4.5-air:free");
          setNotifications(settings.notifyOnComplete ?? true);
          setOfflineQuestions(settings.offlineQuestionsPerDomain || 10);
        }
        setLoading(false);
      } catch (error) {
        console.error('[Settings] Failed to load settings:', error);
        setLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    console.log('[Settings] Saving settings...');
    try {
      await storageService.saveSettings({
        apiKey,
        model: selectedModel,
        defaultModel: selectedModel,
        notifyOnComplete: notifications,
        offlineQuestionsPerDomain: offlineQuestions,
        onboardingCompleted: true,
        updatedAt: new Date(),
      });
      console.log('[Settings] Settings saved successfully');
      alert("Paramètres sauvegardés !");
    } catch (error) {
      console.error('[Settings] Failed to save settings:', error);
      alert("Erreur lors de la sauvegarde des paramètres");
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotificationToggle = async () => {
    const newValue = !notifications;

    // If enabling notifications, request permission first
    if (newValue && !notificationService.isEnabled()) {
      const granted = await notificationService.requestPermission();
      if (!granted) {
        alert("Les notifications nécessitent votre permission pour fonctionner. Vous pouvez les activer dans les paramètres de votre navigateur.");
        return;
      }
    }

    setNotifications(newValue);
  };

  const handleExport = async () => {
    try {
      const data = await indexedDBService.exportData();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `review-iabd-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert("Données exportées avec succès !");
    } catch (error) {
      console.error('[Settings] Export failed:', error);
      alert("Erreur lors de l'export des données");
    }
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        await indexedDBService.importData(text);
        alert("Données importées avec succès !");
        window.location.reload();
      } catch (error) {
        console.error('[Settings] Import failed:', error);
        alert("Erreur lors de l'import des données");
      }
    };
    input.click();
  };

  const handleClearData = async () => {
    if (confirm("Êtes-vous sûr de vouloir supprimer toutes les données locales ?")) {
      try {
        await storageService.clearAllData();
        alert("Données supprimées. Vous allez être redirigé vers l'onboarding.");
        window.location.href = "/onboarding";
      } catch (error) {
        console.error('[Settings] Failed to clear data:', error);
        alert("Erreur lors de la suppression des données");
      }
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return "";
    return key.slice(0, 8) + "..." + key.slice(-4);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement des paramètres...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12">
        <PageHeader
          title="Paramètres"
          description="Configurez votre application"
        />

        <div className="space-y-6">
          {/* API Key */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-accent" />
                <CardTitle>Clé API OpenRouter</CardTitle>
              </div>
              <div className="space-y-3">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Entrez votre clé API"
                  className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary focus:outline-none focus:border-accent"
                />
                <p className="font-mono text-xs text-ink-muted">
                  Actuel: {maskApiKey(apiKey) || "Non configurée"}
                </p>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent text-sm hover:underline"
                >
                  Obtenir une clé API →
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Model Selection */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <Cpu className="w-5 h-5 text-accent" />
                <CardTitle>Modèle IA</CardTitle>
              </div>
              <div className="space-y-2">
                {models.map((model) => (
                  <button
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`w-full p-3 rounded border text-left transition-all flex items-center justify-between ${
                      selectedModel === model.id
                        ? "border-accent bg-accent/10"
                        : "border-paper-dark hover:border-accent/50"
                    }`}
                  >
                    <span className="font-mono text-sm">{model.name}</span>
                    {selectedModel === model.id && (
                      <span className="text-accent text-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Preferences */}
          <Card>
            <CardContent className="pt-6">
              <CardTitle className="mb-4">Préférences</CardTitle>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Notifications</p>
                    <p className="text-sm text-ink-muted">
                      Recevoir une notification quand la génération est terminée
                    </p>
                  </div>
                  <button
                    onClick={handleNotificationToggle}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      notifications ? "bg-accent" : "bg-paper-dark"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        notifications ? "translate-x-6" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="font-medium block mb-2">
                    Questions hors ligne par domaine
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="50"
                    step="5"
                    value={offlineQuestions}
                    onChange={(e) => setOfflineQuestions(parseInt(e.target.value))}
                    className="w-24 px-3 py-2 bg-paper-secondary border border-paper-dark rounded font-mono text-sm focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Management */}
          <Card>
            <CardContent className="pt-6">
              <CardTitle className="mb-4">Gestion des Données</CardTitle>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={handleExport}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Exporter
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={handleImport}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Importer
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  className="w-full text-domain-ml hover:text-domain-ml hover:border-domain-ml"
                  onClick={handleClearData}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Supprimer Toutes les Données
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button
            variant="primary"
            className="w-full"
            onClick={handleSave}
            loading={isSaving}
          >
            Sauvegarder les Paramètres
          </Button>

          {/* Version Info */}
          <div className="text-center font-mono text-xs text-ink-muted">
            Review IABD v2.0.4
          </div>
        </div>
      </main>
    </div>
  );
}
