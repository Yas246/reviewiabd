"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2, LogOut, RefreshCw, CheckCircle2, AlertCircle, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { syncService, SyncStatus } from "@/services/SyncService";

// ============================================
// SYNC SETTINGS
// Synchronisation OPTIONNELLE multi-appareils.
// L'utilisateur colle l'URL + la clé anon de son
// projet Supabase, crée un compte (e-mail ou
// Google), et sa progression est répliquée ligne
// à ligne. Sans compte, l'app reste 100 % locale.
// ============================================

export function SyncSettings() {
  const [state, setState] = useState(syncService.getState());
  const [showConfig, setShowConfig] = useState(false);
  const [url, setUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "config" | "signup" | "signin" | "google" | "sync" | "signout">(null);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    const unsub = syncService.subscribe(() => setState(syncService.getState()));
    setState(syncService.getState());
    return unsub;
  }, []);

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
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
              {state.configured ? (
                <Cloud className="w-6 h-6 text-accent" />
              ) : (
                <CloudOff className="w-6 h-6 text-ink-muted" />
              )}
            </div>
            <div>
              <h3 className="font-mono font-semibold">Synchronisation multi-appareils</h3>
              <p className="text-sm text-ink-muted">
                Optionnel : retrouve ta progression sur ton téléphone et ton ordinateur.
                Sans compte, l&apos;app reste 100 % locale.
              </p>
            </div>
          </div>
          {state.configured && (
            <button
              onClick={() => setShowConfig((v) => !v)}
              className="text-ink-muted hover:text-accent transition-colors"
              aria-label="Modifier la configuration du projet"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Configuration du projet Supabase */}
        {(!state.configured || showConfig) && (
          <div className="space-y-3 mb-5 p-4 border border-paper-dark rounded-lg">
            <p className="text-xs text-ink-muted">
              Crée un projet gratuit sur <span className="font-mono">supabase.com</span>, exécute
              le script SQL de la documentation (table <span className="font-mono">sync_rows</span>),
              puis colle ici l&apos;URL du projet et la clé anon (Settings → API).
            </p>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
              className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
            />
            <input
              type="password"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="Clé anon (ey...)"
              className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={!url.trim() || !anonKey.trim()}
                loading={busy === "config"}
                onClick={() =>
                  run("config", async () => {
                    syncService.saveConfig(url, anonKey);
                    setShowConfig(false);
                  })
                }
              >
                Enregistrer
              </Button>
              {state.configured && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    syncService.clearConfig();
                    setShowConfig(false);
                  }}
                >
                  Retirer la configuration
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Non configuré : rien de plus à afficher */}
        {!state.configured && (
          <p className="text-xs text-ink-muted">
            Pas envie de te connecter ? Continue simplement : tout fonctionne hors ligne.
          </p>
        )}

        {/* Compte */}
        {state.configured && !state.signedIn && (
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
        {state.configured && state.signedIn && (
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
