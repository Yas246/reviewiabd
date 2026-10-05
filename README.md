# Review IABD

Application de révision (PWA, 100 % locale) pour les examens nationaux de la filière
**Intelligence Artificielle et Big Data (IABD)** au Bénin : tronc commun, spécialité et
pratique professionnelle.

## Philosophie

- **Offline-first** : une banque de questions est embarquée dans l'application. Réviser ne
  demande ni clé API ni connexion.
- **Sans backend** : toutes les données (progression, erreurs, favoris, banque de questions)
  vivent dans IndexedDB, sur l'appareil. Export/import JSON pour les sauvegardes.
- **L'IA est optionnelle** : génération par clé API (OpenRouter ou Gemini) possible, ou
  génération SANS clé via la page Importer (prompt copiable à coller dans n'importe quelle
  IA à abonnement, puis import du JSON validé).

## Fonctionnalités

### Modes de révision
- **Pratique** : sessions par matière depuis la banque locale, avec choix du nombre de
  questions et de la difficulté.
- **Examen blanc** : 40 questions / 2 h (tirage équilibré entre les matières) ou
  20 questions / 1 h. Correction masquée pendant l'épreuve.
- **Épreuves réelles** : les vrais sujets scannés retranscrits (tronc commun, spécialité,
  pratique professionnelle) avec corrigés détaillés.
- **Cahier d'erreurs** : chaque erreur est enregistrée et revient au bon moment
  (répétition espacée : 1 → 2 → 4 → 7 → 14 → 30 jours). Deux bonnes réponses de suite =
  question maîtrisée.
- **Favoris** : marque des questions à l'étoile, puis teste-toi dessus (session notée).

### Formats de questions
- QCM à une réponse et **QCM à réponses multiples** (fidèle à la consigne des épreuves :
  « indiquez la ou les lettres »)
- Vrai / Faux justifié
- Texte à trous (tolérance casse/accents)
- **Exercices de code vérifiés** : Python (Pyodide + Pandas), R (webR), SQL (sql.js),
  exécutés localement dans des Web Workers avec tests visibles et cachés
- **Cas pratiques** : énoncé long, sous-questions rédigées, corrigé point par point et
  grille d'auto-évaluation

### Suivi
- Streak quotidien, objectif de questions/jour (réglable), compte à rebours jusqu'à la
  date d'examen (réglable)
- Progression par matière, statistiques globales, historique des examens et des quiz
- Tableau de bord « Révision du jour » (nombre d'erreurs à revoir)

### Qualité des questions
Standard documenté dans [`docs/SPEC_QUESTIONS.md`](docs/SPEC_QUESTIONS.md) :
- positions des bonnes réponses équilibrées (script `scripts/balance-questions.mjs`) ;
- distracteurs de même longueur et même niveau de détail que la bonne réponse (la bonne
  réponse n'est jamais trivable) ;
- une note explicative sur **chaque** option ;
- validation stricte à l'arrivée (`scripts/validate-questions.mjs`) : exactement une bonne
  réponse pour un QCM simple, au moins deux pour un multi, tests cachés obligatoires pour
  le code, etc.

## Stack technique

- **Next.js 16** (App Router), React 19, TypeScript, Tailwind CSS 4
- **IndexedDB** (via `idb`) : sessions, examens, banque de questions, cahier d'erreurs,
  statistiques quotidiennes
- **PWA** : service worker maison (cache-first), installable, notifications optionnelles
- **Runtimes code** : Pyodide (Python 3.14 + Pandas/NumPy), webR (R), sql.js (SQLite),
  servis depuis `public/runtimes/` et mis en cache pour le hors ligne
- Aucune donnée personnelle ne quitte l'appareil

## Démarrage

```bash
npm install
npm run setup:runtimes   # recopie les runtimes WASM dans public/runtimes/ (~68 Mo)
npm run dev
```

Build de production : `npm run build && npm start`.

> Le mode R (webR) exige les en-têtes COOP/COEP : ils sont déjà configurés dans
> `next.config.ts`. Python et SQL fonctionnent partout.

## Matières couvertes (14)

Machine Learning, IA Symbolique, Deep Learning, NLP, Big Data, Data Mining, Data
Warehousing, Systèmes de Recommandation, Visualisation de Données, Éthique de l'IA,
Analyse et Conception (UML/Merise/MVC), Gestion de Projet, Bases de Données et SQL,
R et Python pour la Data.

## Page Importer (génération sans clé API)

1. Choisir matière, nombre, difficulté et formats : l'app produit un prompt complet.
2. Coller le prompt dans ChatGPT, Mistral, Claude... (tout abonnement marche).
3. Coller le JSON renvoyé dans la page : validation stricte, aperçu, ajout à la banque.

Les questions importées rejoignent la banque locale et sont utilisables hors ligne.

## Scripts utiles

| Commande | Rôle |
|---|---|
| `npm run setup:runtimes` | recrée `public/runtimes/` (copie + wheels Pandas) |
| `node scripts/validate-questions.mjs <fichier> [n]` | valide un fichier de questions |
| `node scripts/balance-questions.mjs <fichier...>` | équilibre les positions des bonnes réponses |

## Notes

- La clé API éventuelle est stockée localement (IndexedDB) et n'est utilisée que pour la
  génération de questions.
- L'ancien fichier `test-json-compact.js` (qui contenait une clé) a été supprimé : pensez à
  révoquer toute clé exposée côté OpenRouter.
