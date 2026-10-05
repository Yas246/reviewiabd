#!/usr/bin/env node
// Valide un fichier de questions au format unifié.
// Usage : node scripts/validate-questions.mjs <fichier.json> [nombreAttendu]
// Code de sortie 0 = valide, 1 = erreurs (détails affichés).

import { readFileSync } from "node:fs";

const file = process.argv[2];
const expectedCount = process.argv[3] ? parseInt(process.argv[3]) : null;

if (!file) {
  console.error("Usage : node scripts/validate-questions.mjs <fichier.json> [nombreAttendu]");
  process.exit(1);
}

const VALID_TYPES = new Set([
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "FILL_BLANK",
  "CODE",
  "CASE_STUDY",
]);
const VALID_DIFF = new Set(["easy", "medium", "hard"]);

let data;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`JSON invalide : ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error("Le fichier n'est pas un tableau JSON");
  process.exit(1);
}

const errors = [];
const ids = new Set();
const questionSeens = new Map();
const positionCounts = [0, 0, 0, 0];
let singleCount = 0;
const typeCounts = {};

const push = (id, msg) => errors.push(`[${id}] ${msg}`);

for (let i = 0; i < data.length; i++) {
  const q = data[i];
  const label = q?.id || `index ${i}`;

  if (!q.id) push(label, "id manquant");
  else if (ids.has(q.id)) push(label, `id en double : ${q.id}`);
  else ids.add(q.id);

  if (!VALID_TYPES.has(q.type)) push(label, `type invalide : ${q.type}`);
  if (!VALID_DIFF.has(q.difficulty)) push(label, `difficulté invalide : ${q.difficulty}`);
  if (!q.question || typeof q.question !== "string" || q.question.trim().length < 10)
    push(label, "énoncé manquant ou trop court");
  if (!q.explanation || typeof q.explanation !== "string" || q.explanation.trim().length < 20)
    push(label, "explication manquante ou trop courte");
  if (/\boption [A-D]\b/i.test(q.explanation || ""))
    push(label, "l'explication mentionne une lettre d'option");
  if (typeof q.domain !== "string" || q.domain.length < 3) push(label, "domaine manquant");

  questionSeens.set(
    (q.question || "").slice(0, 50).toLowerCase(),
    (questionSeens.get((q.question || "").slice(0, 50).toLowerCase()) || 0) + 1
  );

  typeCounts[q.type] = (typeCounts[q.type] || 0) + 1;

  const answers = Array.isArray(q.answers) ? q.answers : [];

  if (q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE") {
    if (answers.length < 3) push(label, `moins de 3 options (${answers.length})`);
    const correct = answers.filter((a) => a.isCorrect);
    if (q.type === "SINGLE_CHOICE") {
      if (correct.length !== 1) push(label, `exactement 1 bonne réponse requis, trouvé ${correct.length}`);
      if (answers.length !== 4) push(label, `4 options attendues, trouvé ${answers.length}`);
      singleCount++;
      const pos = answers.findIndex((a) => a.isCorrect);
      if (pos >= 0 && pos < 4) positionCounts[pos]++;
    } else {
      if (correct.length < 2) push(label, `au moins 2 bonnes réponses requis, trouvé ${correct.length}`);
    }
    for (const a of answers) {
      if (!a.text || typeof a.text !== "string" || a.text.trim().length < 1)
        push(label, "option vide");
      if (typeof a.note !== "string" || a.note.trim().length < 10)
        push(label, `note manquante sur l'option : ${(a.text || "").slice(0, 30)}`);
      if (a.isCorrect && a.note && !/[jJ]ust|c'est|oui|correcte|exacte/i.test(a.note)) {
        // simple avertissement, non bloquant
      }
    }
    // longueur : la bonne réponse ne doit pas être un outlier flagrant
    if (answers.length >= 3) {
      const lens = answers.map((a) => (a.text || "").length);
      const correctIdx = answers.findIndex((a) => a.isCorrect);
      const others = lens.filter((_, i) => i !== correctIdx);
      if (correctIdx >= 0 && others.length >= 2) {
        const avgOthers = others.reduce((x, y) => x + y, 0) / others.length;
        if (avgOthers > 0 && lens[correctIdx] > avgOthers * 2.5)
          push(label, `bonne réponse ${lens[correctIdx]} car. vs moyenne distracteurs ${Math.round(avgOthers)} : trop détaillée`);
      }
    }
  }

  if (q.type === "TRUE_FALSE") {
    if (answers.length !== 2) push(label, "V/F doit avoir 2 options");
    else {
      const texts = answers.map((a) => (a.text || "").toLowerCase());
      if (!texts.includes("vrai") || !texts.includes("faux"))
        push(label, `options V/F invalides : ${texts.join(" / ")}`);
      if (answers.filter((a) => a.isCorrect).length !== 1)
        push(label, "V/F doit avoir exactement 1 bonne réponse");
      for (const a of answers) {
        if (typeof a.note !== "string" || a.note.trim().length < 10)
          push(label, `note manquante sur l'option V/F : ${a.text}`);
      }
    }
  }

  if (q.type === "FILL_BLANK") {
    if (!(q.question || "").includes("___")) push(label, "énoncé sans ___ pour le trou");
    if (!Array.isArray(q.blanks) || q.blanks.length === 0) {
      push(label, "blanks manquant");
    } else {
      const holes = (q.question.match(/___/g) || []).length;
      if (holes !== q.blanks.length)
        push(label, `${holes} trou(s) dans l'énoncé vs ${q.blanks.length} blanks`);
      q.blanks.forEach((b, bi) => {
        if (!Array.isArray(b.accepted) || b.accepted.length === 0 || b.accepted.every((s) => !String(s).trim()))
          push(label, `blank ${bi + 1} sans réponse acceptée`);
      });
    }
  }

  if (q.type === "CODE") {
    const c = q.code;
    if (!c || typeof c !== "object") {
      push(label, "bloc code manquant");
    } else {
      if (!["python", "r", "sql"].includes(c.language)) push(label, `langage invalide : ${c.language}`);
      if (!c.solution || typeof c.solution !== "string" || c.solution.trim().length < 5)
        push(label, "solution manquante");
      if (c.language === "sql") {
        if (!c.setup || typeof c.setup !== "string" || !/CREATE TABLE/i.test(c.setup))
          push(label, "SQL : setup avec CREATE TABLE requis");
      } else if (!Array.isArray(c.tests) || c.tests.length === 0) {
        push(label, "tests manquants");
      } else {
        c.tests.forEach((t, ti) => {
          if (!t.name || !t.code) push(label, `test ${ti + 1} incomplet`);
          if (c.language === "python" && !/assert/.test(t.code))
            push(label, `test python ${ti + 1} sans assert`);
          if (c.language === "r" && !/stopifnot/.test(t.code))
            push(label, `test R ${ti + 1} sans stopifnot`);
        });
        const hidden = c.tests.filter((t) => t.hidden).length;
        if (hidden === 0) push(label, "au moins 1 test caché requis");
      }
      if (!c.starter || typeof c.starter !== "string")
        push(label, "starter (squelette) manquant");
    }
  }

  if (q.type === "CASE_STUDY") {
    if (!Array.isArray(q.subQuestions) || q.subQuestions.length === 0) {
      push(label, "subQuestions manquant");
    } else {
      q.subQuestions.forEach((s, si) => {
        if (!s.question || !s.answer) push(label, `sous-question ${si + 1} incomplète`);
        if (!Array.isArray(s.rubric) || s.rubric.length < 2)
          push(label, `sous-question ${si + 1} : grille (rubric) d'au moins 2 points requise`);
      });
    }
  }
}

for (const [q, n] of questionSeens) {
  if (n > 1) push("doublons", `${n} questions identiques commençant par "${q.slice(0, 40)}..."`);
}

if (expectedCount && data.length !== expectedCount) {
  errors.push(`nombre de questions : ${data.length} au lieu de ${expectedCount}`);
}

// Rapport
console.log(`Fichier : ${file}`);
console.log(`Questions : ${data.length}`);
console.log("Types :", JSON.stringify(typeCounts));
if (singleCount > 0) {
  console.log(
    `Positions de la bonne réponse (SINGLE) : A=${positionCounts[0]} B=${positionCounts[1]} C=${positionCounts[2]} D=${positionCounts[3]} sur ${singleCount}`
  );
}

if (errors.length > 0) {
  console.error(`\n${errors.length} ERREUR(S) :`);
  errors.slice(0, 40).forEach((e) => console.error(" - " + e));
  if (errors.length > 40) console.error(` ... et ${errors.length - 40} autres`);
  process.exit(1);
} else {
  console.log("VALIDE ✔");
}
