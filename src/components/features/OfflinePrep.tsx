"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { WifiOff, CheckCircle2, Loader2, Download } from "lucide-react";
import { codeRunner } from "@/services/CodeRunnerService";

// ============================================
// OFFLINE PREP
// Panneau partagé (Paramètres + Onboarding) :
// état des outils de vérification de code et
// préchargement pour le mode hors ligne.
// ============================================

type PrepState = "checking" | "not-cached" | "caching" | "ready" | "failed";

const RUNTIMES: { key: "python" | "r" | "sql"; label: string; detail: string; size: string }[] = [
  { key: "python", label: "Python + Pandas", detail: "Exercices de code Python", size: "~22 Mo" },
  { key: "r", label: "R (webR)", detail: "Exercices de code R", size: "~46 Mo" },
  { key: "sql", label: "SQLite", detail: "Exercices de code SQL", size: "~1 Mo" },
];

export function OfflinePrep() {
  const [swActive, setSwActive] = useState<boolean | null>(null);
  const [prepStates, setPrepStates] = useState<Record<string, PrepState>>({
    python: "checking",
    r: "checking",
    sql: "checking",
  });
  const [progress, setProgress] = useState<Record<string, string>>({});

  const refreshPrepStates = useCallback(async () => {
    const next: Record<string, PrepState> = {};
    for (const rt of RUNTIMES) {
      const cached = await codeRunner.isCached(rt.key);
      next[rt.key] = cached ? "ready" : "not-cached";
    }
    setPrepStates(next);
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then(() => setSwActive(true))
        .catch(() => setSwActive(false));
      navigator.serviceWorker.getRegistration?.().then((reg) => setSwActive(!!reg));
    } else {
      setSwActive(false);
    }
    refreshPrepStates();
  }, [refreshPrepStates]);

  // Préchargement via le SERVICE WORKER : c'est lui qui télécharge chaque
  // fichier et le place dans son cache. Aucun .zip/.wasm ne transite par un
  // téléchargement côté page, donc les gestionnaires type IDM n'ont rien à
  // intercepter. Une fois en cache, les boots des workers sont servis du
  // cache (jamais du réseau) : l'interception ne peut plus rien casser.
  const handlePreload = async (key: "python" | "r" | "sql") => {
    setPrepStates((prev) => ({ ...prev, [key]: "caching" }));
    setProgress((prev) => ({ ...prev, [key]: "démarrage..." }));
    try {
      await codeRunner.precacheViaSW(key, (msg) =>
        setProgress((prev) => ({ ...prev, [key]: msg }))
      );
      const ok = await codeRunner.isCached(key);
      if (!ok) throw new Error("cache incomplet après préchargement");
      setPrepStates((prev) => ({ ...prev, [key]: "ready" }));
    } catch (e) {
      setProgress((prev) => ({
        ...prev,
        [key]: e instanceof Error ? e.message : "échec",
      }));
      setPrepStates((prev) => ({ ...prev, [key]: "failed" }));
    }
  };

  return (
    <div>
      {swActive === false && (
        <p className="text-sm text-domain-ml mb-4">
          Le mode hors ligne nécessite la version production de l&apos;application
          (npm run build puis npm start, ou l&apos;app installée). En dev, ce panneau
          reste inactif.
        </p>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 p-3 bg-paper-secondary rounded border border-paper-dark">
          <div>
            <p className="font-mono text-sm font-semibold">Banque de questions</p>
            <p className="text-xs text-ink-muted">
              1 400 questions, déjà embarquées automatiquement dans l&apos;app
            </p>
          </div>
          <span className="flex items-center gap-1.5 font-mono text-xs text-domain-dl shrink-0">
            <CheckCircle2 className="w-4 h-4" /> PRÊTE
          </span>
        </div>

        {RUNTIMES.map((rt) => {
          const st = prepStates[rt.key];
          return (
            <div
              key={rt.key}
              className="flex items-center justify-between gap-3 p-3 bg-paper-secondary rounded border border-paper-dark"
            >
              <div>
                <p className="font-mono text-sm font-semibold">{rt.label}</p>
                <p className="text-xs text-ink-muted">
                  {rt.detail} • {rt.size}
                </p>
              </div>
              {st === "caching" ? (
                <span className="flex flex-col items-end gap-1 font-mono text-xs text-accent shrink-0">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" /> TÉLÉCHARGEMENT...
                  </span>
                  {progress[rt.key] && (
                    <span className="text-[10px] text-ink-muted">{progress[rt.key]}</span>
                  )}
                </span>
              ) : st === "ready" ? (
                <span className="flex items-center gap-1.5 font-mono text-xs text-domain-dl shrink-0">
                  <CheckCircle2 className="w-4 h-4" /> PRÊT HORS LIGNE
                </span>
              ) : st === "failed" ? (
                <span className="flex flex-col items-end gap-1 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => handlePreload(rt.key)}>
                    Réessayer
                  </Button>
                  {progress[rt.key] && (
                    <span className="font-mono text-[10px] text-domain-ml text-right max-w-[240px]">
                      {progress[rt.key]}
                    </span>
                  )}
                </span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handlePreload(rt.key)}
                  disabled={swActive !== true || st === "checking"}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Précharger
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
