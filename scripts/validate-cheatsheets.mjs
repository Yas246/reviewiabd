#!/usr/bin/env node
// Valide un fichier de cheat sheet.
// Usage : node scripts/validate-cheatsheets.mjs <fichier.json>

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Usage : node scripts/validate-cheatsheets.mjs <fichier.json>");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`JSON invalide : ${e.message}`);
  process.exit(1);
}

const errors = [];
if (typeof data.id !== "string" || !/^[A-Z_]+$/.test(data.id)) errors.push("id manquant ou non majuscules");
if (typeof data.title !== "string" || data.title.length < 1) errors.push("title manquant");
if (typeof data.description !== "string" || data.description.length < 10) errors.push("description manquante");
if (!Array.isArray(data.sections) || data.sections.length < 3) errors.push("moins de 3 sections");

let items = 0;
for (const s of data.sections || []) {
  if (typeof s.title !== "string" || s.title.length < 3) errors.push(`section sans titre : ${JSON.stringify(s).slice(0, 60)}`);
  if (!Array.isArray(s.items) || s.items.length === 0) {
    errors.push(`section « ${s.title} » sans items`);
    continue;
  }
  for (const it of s.items) {
    items++;
    if (typeof it.what !== "string" || it.what.length < 5) errors.push(`[${s.title}] item sans « what » : ${JSON.stringify(it).slice(0, 60)}`);
    if (typeof it.code !== "string" && typeof it.note !== "string")
      errors.push(`[${s.title}] « ${it.what} » : ni code ni note`);
    if (it.code !== undefined && typeof it.code !== "string") errors.push(`[${s.title}] code non texte`);
  }
}

console.log(`${file} : ${data.sections?.length || 0} sections, ${items} items`);
if (errors.length) {
  console.error(`${errors.length} ERREUR(S) :`);
  errors.forEach((e) => console.error(" - " + e));
  process.exit(1);
}
console.log("VALIDE ✔");
