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

const CFG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CFG_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface StoreSpec {
  // lecture locale (retourne un tableau ou l'objet settings)
  read: () => Promise<unknown[] | unknown>;
  // écriture locale d'un enregistrement
  write: (rec: any) => Promise<unknown>;
  // champ servant de clé unique (id, date, ...)
  keyField: string;
  // fusion quand la ligne existe des deux côtés :
  //  - "union" : la locale gagne (données ajoutées, jamais mutées)
  //  - "lww"   : dernier-modifié gagne, comparé sur lwwField (horodatage réel)
  //  - "max"   : chaque compteur prend la plus grande valeur
  merge: "union" | "lww" | "max";
  // champ horodaté pour la fusion "lww"
  lwwField?: string;
  // champs compteurs pour la fusion "max"
  maxFields?: string[];
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
    lwwField: "lastSeenAt",
  },
  dailyStats: {
    read: () => indexedDBService.getAllDailyStats(),
    write: (r) => indexedDBService.saveDailyStat(r),
    keyField: "date",
    merge: "max",
    maxFields: ["answered", "correct", "timeSpent"],
  },
  settings: {
    read: async () => {
      const s = await indexedDBService.getSettings();
      return s ? [s] : [];
    },
    write: (r) => indexedDBService.saveSettings(r),
    keyField: "user_id", // champ synthétique ajouté avant l'envoi
    merge: "lww",
    lwwField: "updatedAt",
  },
  lecture: {
    // Positions de lecture de /banque (une ligne par domaine, stockées
    // dans localStorage : lecture_pos_<domain> = index de question).
    // Fusion max : la position la plus avancée gagne.
    read: async () => {
      if (typeof window === "undefined") return [];
      const prefix = "lecture_pos_";
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) {
          const domain = k.slice(prefix.length);
          out.push({ id: domain, position: Number(localStorage.getItem(k) || "0") });
        }
      }
      return out;
    },
    write: async (r) => {
      if (typeof r?.id === "string") {
        localStorage.setItem("lecture_pos_" + r.id, String(Number(r.position ?? 0)));
      }
    },
    keyField: "id",
    merge: "max",
    maxFields: ["position"],
  },
};

interface SyncRow {
  user_id: string;
  store: string;
  id: string;
  data: unknown;
  updated_at: string;
}

// Extrait l'horodatage RÉEL d'un enregistrement (updatedAt des réglages,
// lastSeenAt des erreurs SRS...) : c'est lui qui arbitre le dernier-modifié,
// pas l'instant d'envoi.
function realTimestamp(rec: unknown): string | null {
  if (!rec || typeof rec !== "object") return null;
  const r = rec as Record<string, unknown>;
  for (const field of ["updatedAt", "lastSeenAt", "createdAt", "startedAt"]) {
    const v = r[field];
    if (v instanceof Date) return v.toISOString();
    if (typeof v === "string" && v.includes("T")) return v;
  }
  return null;
}

export type SyncStatus = "idle" | "working" | "ok" | "offline" | "error";

class SyncService {
  private client: SupabaseClient | null = null;
  private userId: string | null = null;
  private sessionEmail: string | null = null;
  private displayName: string | null = null;
  private status: SyncStatus = "idle";
  private message = "";
  private lastSyncAt: string | null = null;
  private lastCounts: { pushed: number; applied: number; cloud: Record<string, number> } | null = null;
  private listeners = new Set<() => void>();
  private initDone = false;
  private autoPullDone = false;
  private syncing = false;

  // Prénom affichable sur le dashboard (profil Google)
  private extractName(user: any): string | null {
    if (!user) return null;
    const md = user.user_metadata ?? {};
    const raw =
      md.given_name ||
      (md.full_name ? String(md.full_name).split(" ")[0] : null) ||
      md.name ||
      md.preferred_username ||
      (user.email ? String(user.email).split("@")[0] : null);
    return raw ? String(raw) : null;
  }

  private adoptSession(user: any): void {
    const nextId = user?.id ?? null;
    if (nextId !== this.userId) {
      this.autoPullDone = false;
      this.userId = nextId;
      this.displayName = this.extractName(user);
      this.sessionEmail = user?.email ?? null;
    }
    this.notify();
  }

  // ----- Configuration du projet : incrustée au build (env Vercel / .env.local)
  // Une SEULE base Supabase (celle de l'app) sert tous les utilisateurs ;
  // les règles RLS de sync_rows isole les lignes de chaque compte.

  getConfig(): { url: string; key: string } | null {
    if (typeof window === "undefined") return null;
    if (!CFG_URL || !CFG_KEY) return null;
    return { url: CFG_URL, key: CFG_KEY };
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
            this.adoptSession(data.session?.user ?? null);
            // Restauration au retour d'OAuth / au lancement : la session
            // arrive APRÈS l'init de l'app, on lance donc la synchro ici.
            if (this.userId) this.autoPullOnLaunch();
          })
          .catch(() => {});
        this.client.auth.onAuthStateChange((_event, session) => {
          this.adoptSession(session?.user ?? null);
          // Première connexion / retour de Google : synchro immédiate
          if (this.userId) this.autoPullOnLaunch();
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
    displayName: string | null;
    status: SyncStatus;
    message: string;
    lastSyncAt: string | null;
    lastCounts: { pushed: number; applied: number; cloud: Record<string, number> } | null;
  } {
    this.getClient(); // déclenche la restauration de session au premier appel
    return {
      configured: !!this.getConfig(),
      signedIn: !!this.userId,
      email: this.sessionEmail,
      displayName: this.displayName,
      status: this.status,
      message: this.message,
      lastSyncAt: this.lastSyncAt,
      lastCounts: this.lastCounts,
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
          // Horodatage RÉEL de la donnée (sinon instant d'envoi)
          updated_at: realTimestamp(data) ?? now,
        });
      }
    }
    return rows;
  }

  private async applyRemoteRows(remote: SyncRow[]): Promise<number> {
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
        const remoteData = r.data as Record<string, unknown>;
        const localRec = local.find((rec) => this.keyOf(store, rec) === r.id);

        // Absente localement : union (données ajoutées sur un autre appareil)
        if (!localRec) {
          await spec.write(remoteData);
          applied++;
          continue;
        }
        // Présente des deux côtés : fusion selon le type de store
        if (spec.merge === "lww" && spec.lwwField) {
          const localTs = realTimestamp(localRec);
          const remoteTs = realTimestamp(remoteData);
          if (remoteTs && (!localTs || remoteTs > localTs)) {
            await spec.write(remoteData);
            applied++;
          }
        } else if (spec.merge === "max" && spec.maxFields) {
          // Compteurs monotones : chaque champ prend sa plus grande valeur
          const merged = { ...localRec };
          let changed = false;
          for (const f of spec.maxFields) {
            const localVal = Number(localRec[f] ?? 0);
            const remoteVal = Number(remoteData[f] ?? 0);
            if (remoteVal > localVal) {
              merged[f] = remoteVal;
              changed = true;
            }
          }
          if (changed) {
            await spec.write(merged);
            applied++;
          }
        }
      }
    }
    return applied;
  }

  /**
   * Synchronisation complète : pousse TOUTES les lignes locales (upsert),
   * puis applique les lignes distantes absentes ou plus récentes. Les
   * sessions, examens, quiz, questions importées et favoris convergent par
   * union ; les lignes mutables suivent leur horodatage réel ; les stats
   * journalières prennent les compteurs maximaux. Les statistiques globales
   * sont recalculées depuis l'union des sessions.
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
      // 1. TIRER : lire le cloud AVANT tout envoi. Pousser d'abord écraserait
      //    les lignes cloud plus récentes (ex. les réglages modifiés sur le
      //    téléphone) avec les valeurs locales plus anciennes.
      const { data, error } = await client
        .from("sync_rows")
        .select("user_id,store,id,data,updated_at")
        .eq("user_id", this.userId);
      if (error) throw new Error("Récupération : " + error.message);
      const remote = (data ?? []) as SyncRow[];

      // 2. FUSIONNER : appliquer localement les lignes absentes (union) ou
      //    plus récentes (lww sur horodatage réel / max par compteur)
      const applied = await this.applyRemoteRows(remote);

      // 3. POUSHER : l'état local fusionné devient la vérité dans le cloud
      const rows = await this.collectLocalRows(this.userId);
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await client
          .from("sync_rows")
          .upsert(batch, { onConflict: "user_id,store,id" });
        if (error) throw new Error("Envoi : " + error.message);
      }

      this.lastSyncAt = new Date().toISOString();
      this.autoPullDone = true;

      // 4. Statistiques globales = f(sessions) : si la fusion a apporté des
      //    données, on les recalcule pour que le dashboard soit à jour.
      if (applied > 0 || trigger === "manual") {
        const { statisticsService } = await import("./StatisticsService");
        await statisticsService.reset();
      }

      // 5. Compteurs visibles dans la carte Synchronisation
      const cloud: Record<string, number> = {};
      for (const r of remote) {
        cloud[r.store] = (cloud[r.store] || 0) + 1;
      }
      this.lastCounts = {
        pushed: rows.length,
        applied,
        cloud,
      };

      this.setStatus(
        "ok",
        `Synchronisé : ${rows.length} lignes envoyées, ${applied} récupérées.`
      );

      // 6. Si la fusion a modifié les données locales pendant que les écrans
      //    étaient déjà affichés, on recharge pour tout rendre visible.
      //    Boucle impossible : la synchro suivante n'applique plus rien.
      if (applied > 0 && trigger === "auto") {
        window.location.reload();
      }
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
