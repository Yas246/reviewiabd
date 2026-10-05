import { CodeSpec } from "@/types";

// ============================================
// CODE RUNNER SERVICE
// Façade unique pour exécuter du code (Python via
// Pyodide, R via webR, SQL via sql.js) dans des
// Web Workers locaux. Timeout = terminaison du
// worker puis recréation, donc aucun risque de
// blocage par une boucle infinie.
// ============================================

export interface CodeTestResult {
  name: string;
  passed: boolean;
  error?: string;
}

export interface CodeRunResult {
  ok: boolean;
  output?: string;
  error?: string;
  tests?: CodeTestResult[];
}

export interface SqlRunResult extends CodeRunResult {
  columns?: string[];
  rows?: unknown[][];
  expected?: { columns: string[]; rows: unknown[][] } | null;
  match?: boolean;
}

type PendingEntry = {
  resolve: (value: any) => void;
  timer: ReturnType<typeof setTimeout>;
};

class WorkerRunner {
  private worker: Worker | null = null;
  private pending = new Map<string, PendingEntry>();
  private seq = 0;
  private firstCall = true;

  constructor(private url: string, private type: "classic" | "module") {}

  private ensure(): Worker {
    if (!this.worker) {
      this.worker =
        this.type === "module"
          ? new Worker(this.url, { type: "module" })
          : new Worker(this.url);
      this.worker.onmessage = (event: MessageEvent) => {
        const { type, id, result } = event.data || {};
        if (type !== "result") return;
        const entry = this.pending.get(id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(id);
          entry.resolve(result);
        }
      };
    }
    return this.worker;
  }

  run(payload: unknown, timeLimitMs: number): Promise<any> {
    const worker = this.ensure();
    const id = `run-${++this.seq}`;
    // Premier appel : le boot du runtime (Pyodide/webR/sql.js) peut prendre
    // bien plus de temps que le délai anti-boucle-infinie, on lui accorde
    // une grâce de 120 s. Les appels suivants utilisent le délai nominal.
    const effectiveLimit = this.firstCall
      ? Math.max(timeLimitMs, 120_000)
      : timeLimitMs;
    this.firstCall = false;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // Boucle infinie ou blocage : on tue le worker (il se recréera,
        // et le prochain appel repartira avec une grâce de démarrage)
        this.terminate();
        this.firstCall = true;
        this.pending.delete(id);
        resolve({
          ok: false,
          error: `Délai dépassé (${Math.round(effectiveLimit / 1000)} s). Vérifie qu'il n'y a pas de boucle infinie.`,
        });
      }, effectiveLimit);
      this.pending.set(id, { resolve, timer });
      worker.postMessage({ type: "run", id, payload });
    });
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pending.forEach((entry) => clearTimeout(entry.timer));
    this.pending.clear();
  }
}

class CodeRunnerService {
  // Pyodide 314+ exige un module worker (plus de support des workers classiques)
  private py = new WorkerRunner("/workers/py-worker.mjs", "module");
  private r = new WorkerRunner("/workers/r-worker.mjs", "module");
  private sql = new WorkerRunner("/workers/sql-worker.js", "classic");

  async runPython(code: string, spec: CodeSpec): Promise<CodeRunResult> {
    return this.py.run(
      {
        code,
        setup: spec.setup,
        tests: spec.tests.map((t) => ({ name: t.name, code: t.code })),
      },
      spec.timeLimitMs || 10000
    );
  }

  async runR(code: string, spec: CodeSpec): Promise<CodeRunResult> {
    return this.r.run(
      {
        code,
        setup: spec.setup,
        tests: spec.tests.map((t) => ({ name: t.name, code: t.code })),
      },
      Math.max(spec.timeLimitMs || 10000, 20000) // le démarrage de R est plus long
    );
  }

  async runSql(userQuery: string, spec: CodeSpec): Promise<SqlRunResult> {
    const result: SqlRunResult = await this.sql.run(
      { setup: spec.setup, query: userQuery, solution: spec.solution },
      spec.timeLimitMs || 10000
    );
    if (result.ok && result.expected) {
      result.match = this.compareRows(result, result.expected);
    }
    return result;
  }

  /**
   * Compare le résultat utilisateur à la solution : mêmes colonnes,
   * mêmes lignes en tant que multi-ensemble (ordre indifférent).
   */
  private compareRows(result: SqlRunResult, expected: { columns: string[]; rows: unknown[][] }): boolean {
    if (JSON.stringify([...result.columns!].map((c) => c.toLowerCase())) !==
        JSON.stringify([...expected.columns].map((c) => c.toLowerCase()))) {
      return false;
    }
    const normalize = (rows: unknown[][]) =>
      rows
        .map((r) => JSON.stringify(r.map((v) => (typeof v === "number" ? Number(v.toFixed(4)) : v))))
        .sort();
    const a = normalize(result.rows!);
    const b = normalize(expected.rows);
    return a.length === b.length && a.every((row, i) => row === b[i]);
  }

  /**
   * Préchauffe un runtime : démarre le worker et exécute un test trivial.
   * Utile pour télécharger et mettre en cache tous les fichiers du runtime
   * (wasm, wheels...) AVANT de se mettre hors ligne.
   */
  async warmUp(kind: "python" | "r" | "sql"): Promise<void> {
    if (kind === "python") {
      await this.py.run(
        { code: "1 + 1", setup: "", tests: [{ name: "warmup", code: "assert 1 + 1 == 2" }] },
        180_000
      );
    } else if (kind === "r") {
      await this.r.run(
        { code: "1 + 1", setup: "", tests: [{ name: "warmup", code: "stopifnot(1 + 1 == 2)" }] },
        240_000
      );
    } else {
      await this.sql.run(
        { setup: "CREATE TABLE warmup (x INTEGER);", query: "SELECT 1", solution: "SELECT 1;" },
        120_000
      );
    }
  }

  /**
   * Le runtime a-t-il déjà été téléchargé (présent dans le cache du SW) ?
   */
  async isCached(kind: "python" | "r" | "sql"): Promise<boolean> {
    if (typeof window === "undefined" || !("caches" in window)) return false;
    const names = await caches.keys();
    const runtimeCacheName = names.find((n) => n.includes("runtimes"));
    if (!runtimeCacheName) return false;
    const cache = await caches.open(runtimeCacheName);
    const keys = await cache.keys();
    const urls = keys.map((k) => k.url);
    if (kind === "python") {
      return urls.some((u) => u.includes("pyodide.asm.wasm")) && urls.some((u) => u.includes(".whl"));
    }
    if (kind === "r") {
      return urls.some((u) => u.includes("webr") && /R\.bin|\.wasm/i.test(u));
    }
    return urls.some((u) => u.includes("sql-wasm.wasm"));
  }
}

// Singleton instance
export const codeRunner = new CodeRunnerService();
