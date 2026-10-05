/* Worker Pyodide (module ESM) : exécute du Python (avec Pandas/NumPy) localement.
   Pyodide 314+ ne supporte plus les workers classiques : module worker obligatoire.
   Protocole : {type:'run', id, code, setup, tests:[{name, code}]} → {type:'result', id, result} */

import { loadPyodide } from "/runtimes/pyodide/pyodide.mjs";

let pyodide = null;
let loadingPromise = null;

function ensurePyodide() {
  if (!loadingPromise) {
    loadingPromise = (async () => {
      pyodide = await loadPyodide({ indexURL: "/runtimes/pyodide/" });
      await pyodide.loadPackage(["numpy", "pandas"]);
      return pyodide;
    })();
  }
  return loadingPromise;
}

let outputBuffer = [];
function resetOutput() {
  outputBuffer = [];
}
function appendOutput(s) {
  if (outputBuffer.length < 400) outputBuffer.push(s);
}

function cleanError(err) {
  const msg = String(err && err.message ? err.message : err);
  const lines = msg.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(-4).join("\n");
}

async function runJob(payload) {
  await ensurePyodide();
  resetOutput();
  pyodide.setStdout({ batched: appendOutput });
  pyodide.setStderr({ batched: appendOutput });

  if (payload.setup) {
    await pyodide.runPythonAsync(payload.setup);
  }

  await pyodide.runPythonAsync(payload.code);

  const tests = [];
  for (const test of payload.tests || []) {
    try {
      await pyodide.runPythonAsync(test.code);
      tests.push({ name: test.name, passed: true });
    } catch (err) {
      tests.push({ name: test.name, passed: false, error: cleanError(err) });
    }
  }

  return { ok: tests.every((t) => t.passed), output: outputBuffer.join("\n"), tests };
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
      result: { ok: false, output: outputBuffer.join("\n"), error: cleanError(err), tests: [] },
    });
  }
};
