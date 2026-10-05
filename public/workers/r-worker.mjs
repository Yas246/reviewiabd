/* Worker webR : exécute du R localement. Sans crossOriginIsolated (pas de
   SharedArrayBuffer), on force le canal PostMessage, plus lent mais universel.
   Build navigateur officiel : /runtimes/webr/webr.js (le webr.mjs du paquet
   npm est une version Node, inutilisable dans le navigateur).
   Protocole : {type:'run', id, code, setup, tests:[{name, code}]} → {type:'result', id, result} */

import { WebR } from "/runtimes/webr/webr.js";

self.postMessage({ type: "diag", stage: "worker R démarré, import webr.js OK" });

// baseUrl : tout (worker interne, R.bin, vfs) est chargé depuis nos fichiers
   // locaux /runtimes/webr/ — JAMAIS depuis le CDN, sinon pas de hors ligne.
   const webR = new WebR({
     baseUrl: "/runtimes/webr/",
     ...(self.crossOriginIsolated ? {} : { channelType: "post-message" }),
   });
let ready = null;

// Diagnostics : journal fetch + battements pendant l'init
let diag = [];
self.__diag = diag;
const origFetch = self.fetch.bind(self);
self.fetch = async (input, init) => {
  const url = String(input);
  try {
    const res = await origFetch(input, init);
    if (diag.length < 60) diag.push(url.split("/").pop() + ":" + res.status);
    return res;
  } catch (e) {
    if (diag.length < 60) diag.push(url.split("/").pop() + ":FAIL");
    throw e;
  }
};

function ensureWebR() {
  if (!ready) {
    ready = (async () => {
      const hb = setInterval(() => {
        self.postMessage({ type: "diag", stage: "init en cours... fetches=" + diag.length });
      }, 10000);
      try {
        await webR.init();
        clearInterval(hb);
        return webR;
      } catch (e) {
        clearInterval(hb);
        self.postMessage({ type: "diag", stage: "init ERREUR: " + String(e).slice(0, 200) + " fetches=" + diag.join(",") });
        throw e;
      }
    })();
  }
  return ready;
}

async function runJob(payload) {
  await ensureWebR();

  // Exécute du code R en capturant sa sortie console via capture.output
  const capture = async (code) => {
    const wrapped = "paste(capture.output({ " + code + "\n }), collapse=\"\n\")";
    try {
      return await webR.evalRString(wrapped);
    } catch (e) {
      // Le code peut ne rien imprimer ou planter : on renvoie la chaîne vide
      // et on laisse les tests décider, sauf si c'est une vraie erreur R.
      const msg = String((e && e.message) || e);
      if (/cannot get|unable|Error/i.test(msg)) {
        // Tente d'exécuter sans capture pour faire remonter l'erreur R proprement
        await webR.evalRVoid(code);
        return "";
      }
      return "";
    }
  };

  let output = [];
  if (payload.setup) {
    await webR.evalRVoid(payload.setup);
  }
  output.push(await capture(payload.code));

  const tests = [];
  for (const test of payload.tests || []) {
    try {
      // stopifnot() lève une erreur R si la condition est fausse
      await webR.evalRVoid(test.code);
      tests.push({ name: test.name, passed: true });
    } catch (err) {
      tests.push({
        name: test.name,
        passed: false,
        error: String(err && err.message ? err.message : err).slice(0, 400),
      });
    }
  }

  return { ok: tests.every((t) => t.passed), output: output.filter(Boolean).join("\n"), tests };
}

self.onmessage = async (event) => {
  const { type, id, payload } = event.data || {};
  if (type !== "run") return;
  try {
    const result = await runJob(payload || {});
    self.postMessage({ type: "result", id, result });
  } catch (err) {
    const raw = String(err && err.message ? err.message : err);
    self.postMessage({
      type: "result",
      id,
      result: { ok: false, output: "", error: raw.slice(0, 400), tests: [] },
    });
  }
};
