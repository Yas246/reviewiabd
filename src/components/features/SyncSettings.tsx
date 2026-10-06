"use client";

import { useEffect, useState } from "react";
import { Cloud, Loader2, LogOut, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { syncService, SyncStatus } from "@/services/SyncService";

// ============================================
// SYNC SETTINGS
// Synchronisation OPTIONNELLE multi-appareils.
// La base Supabase est celle de l'app (incrustée
// au build). Activation en UN geste : connexion
// Google. Sans connexion, l'app reste 100 %
// locale. La carte ne s'affiche que si la base
// est branchée (variables d'environnement).
// ============================================

function GoogleIcon() {
  return (
    <svg className="w-4 h-4 mr-2 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export function SyncSettings() {
  const [state, setState] = useState(syncService.getState());
  const [busy, setBusy] = useState<null | "google" | "sync" | "signout">(null);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const unsub = syncService.subscribe(() => setState(syncService.getState()));
    setState(syncService.getState());
    return unsub;
  }, []);

  // Base non branchée au build : la carte n'a aucun sens pour l'utilisateur
  if (!state.configured) return null;

  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind);
    setLocalError("");
    try {
      await fn();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setBusy(null);
    }
  };

  const statusIcon = (s: SyncStatus) => {
    if (s === "working") return <Loader2 className="w-4 h-4 animate-spin text-accent" />;
    if (s === "ok") return <CheckCircle2 className="w-4 h-4 text-domain-dl" />;
    if (s === "error" || s === "offline") return <AlertCircle className="w-4 h-4 text-domain-ml" />;
    return <Cloud className="w-4 h-4 text-ink-muted" />;
  };

  return (
    <Card className="mb-8">
      <CardContent>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
            <Cloud className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h3 className="font-mono font-semibold">Synchronisation multi-appareils</h3>
            <p className="text-sm text-ink-muted">
              Optionnel : retrouve ta progression sur ton téléphone et ton ordinateur.
              Sinon, tout reste 100 % local sur cet appareil.
            </p>
          </div>
        </div>

        {/* Non connecté : un seul geste, la connexion Google */}
        {!state.signedIn && (
          <div className="space-y-2">
            <Button
              variant="primary"
              size="sm"
              loading={busy === "google"}
              onClick={() => run("google", () => syncService.signInWithGoogle())}
            >
              <GoogleIcon />
              Continuer avec Google
            </Button>
            <p className="text-xs text-ink-muted">
              Connecte-toi une seule fois sur chaque appareil : tes sessions, tes
              questions importées et tes réglages se retrouvent partout.
            </p>
          </div>
        )}

        {/* Connecté : état + actions */}
        {state.signedIn && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-ink-secondary">
              {statusIcon(state.status)}
              <span className="font-mono text-sm">{state.email}</span>
              {state.lastSyncAt && (
                <span className="font-mono text-xs text-ink-muted">
                  · dernière synch {new Date(state.lastSyncAt).toLocaleString("fr-FR")}
                </span>
              )}
            </div>
            {state.message && (
              <p
                className={`text-xs ${
                  state.status === "error" || state.status === "offline"
                    ? "text-domain-ml"
                    : "text-ink-muted"
                }`}
              >
                {state.message}
              </p>
            )}
            {state.lastCounts && (
              <p className="font-mono text-[10px] text-ink-muted leading-relaxed">
                Cloud :{" "}
                {Object.entries(state.lastCounts.cloud)
                  .map(([store, n]) => {
                    const labels: Record<string, string> = {
                      sessions: "sessions",
                      exams: "examens",
                      practiceQuizzes: "quiz",
                      questions: "questions importées",
                      favorites: "favoris",
                      mistakes: "erreurs",
                      dailyStats: "jours",
                      settings: "réglages",
                    };
                    return `${labels[store] ?? store} ${n}`;
                  })
                  .join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                variant="primary"
                size="sm"
                loading={busy === "sync"}
                onClick={() =>
                  run("sync", async () => {
                    await syncService.syncAll("manual");
                    window.location.reload();
                  })
                }
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Synchroniser maintenant
              </Button>
              <Button
                variant="secondary"
                size="sm"
                loading={busy === "signout"}
                onClick={() => run("signout", () => syncService.signOut())}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Se déconnecter
              </Button>
            </div>
            <p className="text-xs text-ink-muted">
              La synchronisation part aussi automatiquement : au lancement de
              l&apos;app, après chaque quiz ou examen terminé, après un import de
              questions et au retour de la connexion. Les données des deux appareils
              se fusionnent : les sessions s&apos;additionnent, les réglages suivent
              la version la plus récente.
            </p>
          </div>
        )}

        {localError && (
          <p className="mt-3 text-xs text-domain-ml flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {localError}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
