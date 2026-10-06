import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { indexedDBService } from "./IndexedDBService";

// ============================================
// SYNC SERVICE
// Synchronisation OPTIONNELLE multi-appareils
// via le projet Supabase de l'utilisateur
// (Auth + une table sync_rows).
// - Par défaut l'app reste 100 % locale, sans
//   compte : rien ne change pour le hors ligne.
// - Les enregistrements sont répliqués LIGNE À
//   LIGNE (store, id, data, updated_at) : deux
//   appareils convergent par UNION pour les
//   données ajoutées (sessions, examens, quiz,
//   questions importées) et au dernier-modifié
//   pour les lignes mutables (erreurs SRS,
//   stats journalières, réglages).
// - Les statistiques du dashboard restent
//   calculées localement à partir des sessions.
// ============================================

const CFG_URL = "sync_cfg_url";
const CFG_KEY = "sync_cfg_key";

interface StoreSpec {
  // lecture locale (retourne un tableau ou l'objet settings)
  read: () => Promise<unknown[] | unknown>;
  // écriture locale d'un enregistrement
  write: (rec: any) => Promise<unknown>;
  // champ servant de clé unique (id, date, ...)
  keyField: string;
  // fusion quand la ligne existe des deux côtés :
  //  - "union"  : la locale gagne (données ajoutées, jamais mutées)
  //  - "lww"    : dernier-modifié gagne (via l'ombre des horodatages)
  //  - "max"    : le plus grand compteur gagne (progression monotone)
  merge: "union" | "lww" | "max";
  // champ compteur pour la fusion "max"
  maxField?: string;
}

const STORES: Record<string, StoreSpec> = {
  sessions: {
    read: () => indexedDBService.getAllSessions(),
    write: (r) => indexedDBService.saveSession(r),
    keyField: "id",
    merge: "union",
  },
  exams: {
    read: () => indexedDBService.getAllExams(),
    write: (r) => indexedDBService.saveExam(r),
    keyField: "id",
    merge: "union",
  },
  practiceQuizzes: {
    read: () => indexedDBService.getAllPracticeQuizzes(),
    write: (r) => indexedDBService.savePracticeQuiz(r),
    keyField: "id",
    merge: "union",
  },
  questions: {
    // Questions IMPORTÉES par l'utilisateur : elles se synchronisent
    // aussi, ligne par ligne, par union des identifiants.
    read: () => indexedDBService.getAllQuestions(),
    write: (r) => indexedDBService.saveQuestions([r]),
    keyField: "id",
    merge: "union",
  },
  favorites: {
    read: () => indexedDBService.getAllFavorites(),
    write: (r) => indexedDBService.addFavorite(r),
    keyField: "id",
    merge: "union",
  },
  mistakes: {
    read: () => indexedDBService.getAllMistakes(),
    write: (r) => indexedDBService.saveMistake(r),
    keyField: "id",
    merge: "lww",
  },
  dailyStats: {
    read: () => indexedDBService.getAllDailyStats(),
    write: (r) => indexedDBService.saveDailyStat(r),
    keyField: "date",
    merge: "max",
    maxField: "questionsAnswered",
  },
  settings: {
    read: async () => {
      const s = await indexedDBService.getSettings();
      return s ? [s] : [];
    },
    write: (r) => indexedDBService.saveSettings(r),
    keyField: "user_id", // champ synthétique ajouté avant l'envoi
    merge: "lww",
  },
};

interface SyncRow {
  user_id: string;
  store: string;
  id: string;
  data: unknown;
  updated_at: string;
}

// Ombre locale des horodatages distants connus : permet un vrai
// dernier-modifié-gagne pour les lignes mutables (réglages, erreurs SRS,
// stats journalières) sans ajouter de champ updated_at dans IndexedDB.
const SHADOW_KEY = "sync_shadow";

function loadShadow(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(SHADOW_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveShadow(shadow: Record<string, string>): void {
  localStorage.setItem(SHADOW_KEY, JSON.stringify(shadow));
}

function shadowSet(shadow: Record<string, string>, store: string, id: string, at: string): void {
  shadow[`${store}:${id}`] = at;
}

export type SyncStatus = "idle" | "working" | "ok" | "offline" | "error";

class SyncService {
  private client: SupabaseClient | null = null;
  private userId: string | null = null;
  private sessionEmail: string | null = null;
  private status: SyncStatus = "idle";
  private message = "";
  private lastSyncAt: string | null = null;
  private listeners = new Set<() => void>();
  private initDone = false;
  private autoPullDone = false;
  private syncing = false;

  // ----- Configuration du projet (URL + clé anon) -----

  getConfig(): { url: string; key: string } | null {
    if (typeof window === "undefined") return null;
    const url = localStorage.getItem(CFG_URL);
    const key = localStorage.getItem(CFG_KEY);
    return url && key ? { url, key } : null;
  }

  saveConfig(url: string, key: string): void {
    localStorage.setItem(CFG_URL, url.trim().replace(/\/+$/, ""));
    localStorage.setItem(CFG_KEY, key.trim());
    // On repart d'un client propre
    this.client = null;
    this.userId = null;
    this.sessionEmail = null;
    this.initDone = false;
    this.notify();
  }

  clearConfig(): void {
    localStorage.removeItem(CFG_URL);
    localStorage.removeItem(CFG_KEY);
    this.client = null;
    this.userId = null;
    this.sessionEmail = null;
    this.initDone = false;
    this.status = "idle";
    this.message = "";
    this.notify();
  }

  private getClient(): SupabaseClient | null {
    const cfg = this.getConfig();
    if (!cfg) return null;
    if (!this.client) {
      this.client = createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
      if (!this.initDone) {
        this.initDone = true;
        this.client.auth
          .getSession()
          .then(({ data }) => {
            this.userId = data.session?.user?.id ?? null;
            this.sessionEmail = data.session?.user?.email ?? null;
            this.notify();
          })
          .catch(() => {});
        this.client.auth.onAuthStateChange((_event, session) => {
          const nextId = session?.user?.id ?? null;
          if (nextId !== this.userId) {
            this.autoPullDone = false;
            this.userId = nextId;
            this.sessionEmail = session?.user?.email ?? null;
          }
          this.notify();
        });
      }
    }
    return this.client;
  }

  // ----- État observé par l'UI -----

  getState(): {
    configured: boolean;
    signedIn: boolean;
    email: string | null;
    status: SyncStatus;
    message: string;
    lastSyncAt: string | null;
  } {
    this.getClient(); // déclenche la restauration de session au premier appel
    return {
      configured: !!this.getConfig(),
      signedIn: !!this.userId,
      email: this.sessionEmail,
      status: this.status,
      message: this.message,
      lastSyncAt: this.lastSyncAt,
    };
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  private setStatus(status: SyncStatus, message: string): void {
    this.status = status;
    this.message = message;
    this.notify();
  }

  // ----- Compte -----

  async signUp(email: string, password: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Configure d'abord ton projet Supabase.");
    this.setStatus("working", "Création du compte...");
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) {
      this.setStatus("error", error.message);
      throw new Error(error.message);
    }
    this.sessionEmail = email;
    if (data.session) {
      this.userId = data.user?.id ?? null;
      this.setStatus("ok", "Compte créé et connecté.");
    } else {
      this.setStatus(
        "ok",
        "Compte créé. Valide l'e-mail de confirmation puis connecte-toi."
      );
    }
  }

  async signIn(email: string, password: string): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Configure d'abord ton projet Supabase.");
    this.setStatus("working", "Connexion...");
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      this.setStatus("error", error.message);
      throw new Error(error.message);
    }
    this.userId = data.user?.id ?? null;
    this.sessionEmail = email;
    this.setStatus("ok", "Connecté.");
    this.autoPullDone = false;
    await this.syncAll("auto");
  }

  /**
   * Connexion Google (OAuth) : Supabase gère tout, aucun mot de passe.
   * Prérequis côté projet : provider Google activé (client ID/secret)
   * et l'URL de l'app ajoutée aux redirect URLs autorisées.
   */
  async signInWithGoogle(): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Configure d'abord ton projet Supabase.");
    this.setStatus("working", "Redirection vers Google...");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/settings" },
    });
    if (error) {
      this.setStatus("error", error.message);
      throw new Error(error.message);
    }
    // La page quitte vers Google puis revient ; l'état est restauré au retour.
  }

  async signOut(): Promise<void> {
    const client = this.getClient();
    if (client) await client.auth.signOut();
    this.userId = null;
    this.sessionEmail = null;
    this.autoPullDone = false;
    this.setStatus("idle", "Déconnecté.");
  }

  // ----- Réplique ligne à ligne -----

  private keyOf(store: string, rec: Record<string, unknown>): string {
    const kf = STORES[store].keyField;
    return String(rec[kf] ?? "user");
  }

  private async collectLocalRows(userId: string): Promise<SyncRow[]> {
    const now = new Date().toISOString();
    const rows: SyncRow[] = [];
    for (const [store, spec] of Object.entries(STORES)) {
      const raw = await spec.read();
      if (!Array.isArray(raw)) continue;
      for (const rec of raw) {
        if (!rec || typeof rec !== "object") continue;
        const data =
          store === "settings"
            ? { ...rec, user_id: "user" }
            : (rec as Record<string, unknown>);
        rows.push({
          user_id: userId,
          store,
          id: this.keyOf(store, data),
          data,
          updated_at: now,
        });
      }
    }
    return rows;
  }

  private async applyRemoteRows(
    remote: SyncRow[],
    shadow: Record<string, string>
  ): Promise<number> {
    let applied = 0;
    const byStore = new Map<string, SyncRow[]>();
    for (const r of remote) {
      if (!STORES[r.store]) continue;
      if (!byStore.has(r.store)) byStore.set(r.store, []);
      byStore.get(r.store)!.push(r);
    }
    for (const [store, rows] of byStore) {
      const spec = STORES[store];
      const local = (await spec.read()) as Record<string, unknown>[];
      const localKeys = new Set(local.map((rec) => this.keyOf(store, rec)));
      for (const r of rows) {
        const known = shadow[`${store}:${r.id}`];
        // Déjà connue dans cette version : rien à faire
        if (known && known >= r.updated_at && spec.merge !== "max") continue;
        // Absente localement : union (données ajoutées sur un autre appareil)
        if (!localKeys.has(r.id)) {
          await spec.write(r.data as Record<string, unknown>);
          shadowSet(shadow, store, r.id, r.updated_at);
          applied++;
          continue;
        }
        // Présente des deux côtés : fusion selon le type de store
        if (spec.merge === "lww" && known && known < r.updated_at) {
          await spec.write(r.data as Record<string, unknown>);
          shadowSet(shadow, store, r.id, r.updated_at);
          applied++;
        } else if (spec.merge === "max" && spec.maxField) {
          const localRec = local.find(
            (rec) => this.keyOf(store, rec) === r.id
          );
          const localVal = Number(localRec?.[spec.maxField] ?? 0);
          const remoteVal = Number(
            (r.data as Record<string, unknown>)?.[spec.maxField] ?? 0
          );
          if (remoteVal > localVal) {
            await spec.write(r.data as Record<string, unknown>);
            applied++;
          }
        }
      }
    }
    saveShadow(shadow);
    return applied;
  }

  /**
   * Synchronisation complète : pousse TOUTES les lignes locales (upsert),
   * puis applique les lignes distantes absentes localement. Les sessions,
   * examens, quiz, questions importées et favoris convergent par union ;
   * les lignes mutables suivent la dernière écriture.
   */
  async syncAll(trigger: "manual" | "auto"): Promise<void> {
    const client = this.getClient();
    if (!client) throw new Error("Projet Supabase non configuré.");
    if (!this.userId) throw new Error("Non connecté.");
    if (this.syncing) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setStatus(
        "offline",
        "Hors ligne : la synchronisation reprendra à la reconnexion."
      );
      return;
    }

    this.syncing = true;
    this.setStatus("working", "Synchronisation...");
    try {
      const shadow = loadShadow();
      const now = new Date().toISOString();

      // 1. Pousser les lignes locales (par lots de 200) et noter les
      //    horodatages dans l'ombre locale.
      const rows = await this.collectLocalRows(this.userId);
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await client
          .from("sync_rows")
          .upsert(batch, { onConflict: "user_id,store,id" });
        if (error) throw new Error("Envoi : " + error.message);
      }
      for (const r of rows) shadowSet(shadow, r.store, r.id, now);
      saveShadow(shadow);

      // 2. Ramener les lignes distantes
      const { data, error } = await client
        .from("sync_rows")
        .select("user_id,store,id,data,updated_at")
        .eq("user_id", this.userId);
      if (error) throw new Error("Récupération : " + error.message);

      // 3. Appliquer les lignes distantes plus récentes que ce qu'on connaît
      const applied = await this.applyRemoteRows((data ?? []) as SyncRow[], shadow);

      this.lastSyncAt = new Date().toISOString();
      this.autoPullDone = true;
      this.setStatus(
        "ok",
        `Synchronisé : ${rows.length} lignes envoyées, ${applied} récupérées.`
      );
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur de synchronisation";
      this.setStatus("error", msg);
      throw e;
    } finally {
      this.syncing = false;
    }
  }

  /** Récupération silencieuse au lancement (si connecté et en ligne). */
  async autoPullOnLaunch(): Promise<void> {
    if (this.autoPullDone) return;
    const client = this.getClient();
    if (!client || !this.userId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      await this.syncAll("auto");
    } catch {
      // silencieux : le statut est déjà reflété dans getState()
    }
  }

  // ----- Synchro automatique après une progression -----

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineHooked = false;

  /**
   * À appeler après chaque changement de progression (quiz terminé,
   * examen terminé, questions importées). Synchro silencieuse différée
   * de 4 s (laisse l'UI finir), uniquement si connecté et en ligne.
   */
  notifyProgressChanged(): void {
    const client = this.getClient();
    if (!client || !this.userId) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncAll("auto").catch(() => {});
    }, 4000);
  }

  /** À brancher une fois : re-synchronise au retour du réseau. */
  hookOnlineListener(): void {
    if (this.onlineHooked || typeof window === "undefined") return;
    this.onlineHooked = true;
    window.addEventListener("online", () => {
      if (this.userId) {
        this.autoPullDone = false;
        this.autoPullOnLaunch();
      }
    });
  }
}

export const syncService = new SyncService();
