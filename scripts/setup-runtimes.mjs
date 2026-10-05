// Recrée public/runtimes/ depuis node_modules + télécharge les wheels Pyodide
// manquants (pandas et ses dépendances) depuis le CDN officiel.
// Usage : npm run setup:runtimes
import { existsSync, mkdirSync, copyFileSync, cpSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rt = (p) => path.join(root, "public", "runtimes", p);
const nm = (p) => path.join(root, "node_modules", p);

function copyTo(dir, srcDir, files) {
  mkdirSync(dir, { recursive: true });
  for (const f of files) copyFileSync(path.join(srcDir, f), path.join(dir, f));
}

copyTo(rt("pyodide"), nm("pyodide"), [
  "pyodide.mjs", "pyodide.js", "pyodide.asm.mjs", "pyodide.asm.wasm",
  "python_stdlib.zip", "pyodide-lock.json",
]);
copyTo(rt("sqljs"), nm("sql.js/dist"), ["sql-wasm.js", "sql-wasm.wasm"]);

const webrDist = nm("webr/dist");
mkdirSync(rt("webr"), { recursive: true });
copyTo(rt("webr"), webrDist, [
  "webr.js", "webr-worker.js", "R.js", "libRblas.so", "libRlapack.so",
]);
for (const d of ["R.wasm", "webR", "vfs"]) {
  cpSync(path.join(webrDist, d), path.join(rt("webr"), d), { recursive: true });
}

// Wheels Pyodide : pandas + dépendances, résolues récursivement via pyodide-lock.json
const lock = JSON.parse(readFileSync(rt("pyodide/pyodide-lock.json"), "utf8"));
const version = process.env.PYODIDE_VERSION || "314.0.7";
const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
const need = ["pandas"];
const seen = new Set();
while (need.length) {
  const name = need.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  const pkg = lock.packages[name];
  if (!pkg) continue;
  const dest = rt(path.join("pyodide", pkg.file_name));
  if (!existsSync(dest)) {
    console.log(`télécharge ${pkg.file_name}...`);
    const res = await fetch(base + pkg.file_name);
    if (!res.ok) throw new Error(`${res.status} sur ${base + pkg.file_name}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  for (const dep of pkg.depends ?? []) need.push(dep);
}
console.log(`OK : ${seen.size} paquet(s) pyodide présents dans public/runtimes/pyodide`);
