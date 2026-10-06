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
// au build) : l'utilisateur ne configure RIEN,
// il crée simplement un compte (e-mail ou Google).
// Sans compte, l'app reste 100 % locale.
// La carte ne s'affiche que si la base est
// branchée (variables d'environnement présentes).
// ============================================

export function SyncSettings() {
  const [state, setState] = useState(syncService.getState());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "signup" | "signin" | "google" | "sync" | "signout">(null);
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
              Sans compte, l&apos;app reste 100 % locale.
            </p>
          </div>
        </div>

        {/* Non connecté : créer un compte ou se connecter */}
        {!state.signedIn && (
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mot de passe (8 caractères minimum)"
              className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                variant="primary"
                size="sm"
                disabled={!email.trim() || password.length < 8}
                loading={busy === "signin"}
                onClick={() => run("signin", () => syncService.signIn(email.trim(), password))}
              >
                Se connecter
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!email.trim() || password.length < 8}
                loading={busy === "signup"}
                onClick={() => run("signup", () => syncService.signUp(email.trim(), password))}
              >
                Créer un compte
              </Button>
              <span className="font-mono text-[10px] uppercase text-ink-muted">ou</span>
              <Button
                variant="secondary"
                size="sm"
                loading={busy === "google"}
                onClick={() => run("google", () => syncService.signInWithGoogle())}
              >
                Continuer avec Google
              </Button>
            </div>
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
              Au lancement de l&apos;app, la progression du cloud est récupérée
              automatiquement. Après chaque synchronisation, les données des deux
              appareils sont fusionnées : les sessions s&apos;additionnent, les
              réglages suivent la version la plus récente.
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
