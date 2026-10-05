/* Worker sql.js : exécute du SQL (SQLite en mémoire) localement.
   Protocole : {type:'run', id, setup, query} → {type:'result', id, result:{columns, rows, error}} */

self.importScripts("/runtimes/sqljs/sql-wasm.js");

let SQL = null;

async function ensureSql() {
  if (!SQL) {
    SQL = await initSqlJs({ locateFile: (f) => "/runtimes/sqljs/" + f });
  }
  return SQL;
}

function rowsOf(db, query, limit = 500) {
  const stmt = db.prepare(query);
  const columns = stmt.getColumnNames();
  const rows = [];
  while (stmt.step() && rows.length <= limit) {
    rows.push(stmt.get());
  }
  stmt.free();
  if (rows.length > limit) {
    throw new Error(`Requête : plus de ${limit} lignes retournées, résultat tronqué.`);
  }
  return { columns, rows };
}

async function runJob(payload) {
  const SQLLib = await ensureSql();
  const db = new SQLLib.Database();

  if (payload.setup) {
    db.run(payload.setup);
  }

  const result = rowsOf(db, payload.query);

  // Exécute aussi la solution de référence sur la même base pour comparaison
  let expected = null;
  if (payload.solution) {
    const db2 = new SQLLib.Database();
    if (payload.setup) db2.run(payload.setup);
    expected = rowsOf(db2, payload.solution);
  }

  return {
    ok: true,
    columns: result.columns,
    rows: result.rows,
    expected: expected ? { columns: expected.columns, rows: expected.rows } : null,
  };
}

self.onmessage = async (event) => {
  const { type, id, payload } = event.data || {};
  if (type !== "run") return;
  try {
    const result = await runJob(payload || {});
    self.postMessage({ type: "result", id, result });
  } catch (err) {
    self.postMessage({
      type: "result",
      id,
      result: { ok: false, error: String(err && err.message ? err.message : err).slice(0, 400) },
    });
  }
};
