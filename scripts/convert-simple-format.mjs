#!/usr/bin/env node
// Convertit les fichiers de questions au format "simple" (options + answer)
// vers le format unifié (answers avec id/isCorrect), SANS toucher au texte
// des questions ni aux positions. Les notes par option sont ajoutées ensuite
// par les agents de contenu.
// Usage : node scripts/convert-simple-format.mjs <fichier.json> <PREFIXE_ID> <DOMAIN>

import { readFileSync, writeFileSync } from "node:fs";

const [file, prefix, domain] = process.argv.slice(2);
if (!file || !prefix || !domain) {
  console.error("Usage : node scripts/convert-simple-format.mjs <fichier.json> <PREFIXE> <DOMAIN>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(file, "utf8"));
const out = [];
let converted = 0;
let alreadyFull = 0;

for (const q of raw) {
  if ("answers" in q) {
    // Déjà au format complet : normalise les ids d'options si absents
    alreadyFull++;
    out.push({
      ...q,
      domain: q.domain || domain,
      answers: (q.answers || []).map((a, i) => ({
        ...a,
        id: a.id || `${q.id}_${String.fromCharCode(97 + i)}`,
      })),
    });
    continue;
  }

  const letter = String(q.answer || "A").toUpperCase();
  const letterIdx = { A: 0, B: 1, C: 2, D: 3 }[letter] ?? 0;
  const answers = (q.options || []).map((opt, i) => ({
    id: `${q.id}_${String.fromCharCode(97 + i)}`,
    text: String(opt).replace(/^[A-D]\)\s*/i, "").trim(),
    isCorrect: i === letterIdx,
  }));

  out.push({
    id: q.id,
    domain,
    type: "SINGLE_CHOICE",
    question: q.question,
    answers,
    explanation: q.explanation || "",
    difficulty: "medium",
    tags: [prefix.toLowerCase()],
  });
  converted++;
}

writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(
  `${file} : ${converted} questions converties, ${alreadyFull} déjà au format complet (total ${out.length})`
);
