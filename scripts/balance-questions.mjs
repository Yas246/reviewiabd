#!/usr/bin/env node
// Rééquilibre les positions des bonnes réponses dans un fichier de questions.
// - SINGLE_CHOICE : la bonne réponse tourne sur les positions A,B,C,D (i % 4)
//   avec un décalage aléatoire par fichier pour la variété.
// - TRUE_FALSE : alterne Vrai/Faux en première position.
// - MULTIPLE_CHOICE : mélange aléatoire (la position n'a pas de sens).
// Usage : node scripts/balance-questions.mjs <fichier.json> [<fichier2.json> ...]
// Modifie les fichiers en place (JSON pretty, 2 espaces).

import { readFileSync, writeFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage : node scripts/balance-questions.mjs <fichier.json> [...]");
  process.exit(1);
}

for (const file of files) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const offset = Math.floor(Math.random() * 4);
  let singleIdx = 0;
  let vfIdx = 0;

  for (const q of data) {
    if (q.type === "SINGLE_CHOICE" && Array.isArray(q.answers) && q.answers.length === 4) {
      const correctIdx = q.answers.findIndex((a) => a.isCorrect);
      const target = (singleIdx + offset) % 4;
      singleIdx++;
      if (correctIdx >= 0 && correctIdx !== target) {
        const tmp = q.answers[target];
        q.answers[target] = q.answers[correctIdx];
        q.answers[correctIdx] = tmp;
      }
    } else if (q.type === "TRUE_FALSE" && Array.isArray(q.answers) && q.answers.length === 2) {
      const wantedFirst = vfIdx % 2 === 0 ? "vrai" : "faux";
      vfIdx++;
      const firstIs = q.answers[0].text.toLowerCase();
      if (firstIs !== wantedFirst) {
        const tmp = q.answers[0];
        q.answers[0] = q.answers[1];
        q.answers[1] = tmp;
      }
    } else if (q.type === "MULTIPLE_CHOICE" && Array.isArray(q.answers)) {
      for (let i = q.answers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q.answers[i], q.answers[j]] = [q.answers[j], q.answers[i]];
      }
    }
  }

  writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");

  // Rapport
  const pos = [0, 0, 0, 0];
  let singles = 0;
  for (const q of data) {
    if (q.type === "SINGLE_CHOICE") {
      singles++;
      const p = q.answers.findIndex((a) => a.isCorrect);
      if (p >= 0 && p < 4) pos[p]++;
    }
  }
  console.log(`${file} : équilibré (A=${pos[0]} B=${pos[1]} C=${pos[2]} D=${pos[3]} sur ${singles})`);
}
