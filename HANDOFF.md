# HANDOFF.md : Review IABD

Dernière mise à jour : 2026-10-05 (section Cheat Sheets : 8 fiches, 292 entrées, page avec recherche)

## Cheat Sheets (demande utilisateur)

- Page /cheatsheets : liste des fiches par matière, vue fiche ouverte (sections, items
  « ça sert à quoi / code / piège »), recherche DANS la fiche ouverte et recherche
  TRANSVERSALE sur toutes les fiches.
- 8 fiches (public/cheatsheets/*.json, format docs/SPEC_CHEATSHEETS.md, validateur
  scripts/validate-cheatsheets.mjs) : PYTHON (19 sections/56), R (15/41), SQL (11/33),
  MACHINE_LEARNING (46), DEEP_LEARNING (43), ANALYSE_CONCEPTION (46), GESTION_PROJET (41),
  BIG_DATA (42) = 348 entrées, toutes VALIDE. Fiches langage reconstruites sur le modèle
  des cheat sheets de référence en ligne (pythoncheatsheet.org, DataCamp Basics of R) :
  affectation, types, chaînes, listes/dicts, conditions, boucles, fonctions, erreurs,
  fichiers, dates... AVANT les parties data. sw.js : /cheatsheets/* en NETWORK-FIRST
  (fraîcheur des fiches, secours cache hors ligne).
- Accès : menu « Plus » (premier entré) + mobile + carte sur le tableau de bord.
- SW : /cheatsheets/* ajouté à la règle runtime-asset (cache-first) → consultable hors
  ligne une fois visité.
- Matière renommée aussi dans les prompts IA : « Python et R: data frames... ».

## Retours utilisateur intégrés (série 2)

1. ONBOARDING en 3 étapes : 1) clé API (avec « Commencer sans IA »), 2) modèle (si clé),
   3) NOUVELLE étape « Préparation hors ligne » : banque de questions embarquée
   automatiquement (progression à l'écran de démarrage), et les outils de vérification
   de code (Python/R/SQL) proposés en option avec la mention « télécharge-les maintenant
   ou plus tard dans Paramètres ». Bouton « Aller à l'application ». La sauvegarde des
   settings se fait uniquement à la fin (composant partagé OfflinePrep.tsx utilisé par
   l'onboarding ET les Paramètres).
2. NAVBAR ÉPURÉE : desktop = Accueil, Pratique, Examen, Épreuves réelles + menu « Plus »
   (Erreurs, Favoris, Importer, Historique, fermeture au clic extérieur) + icône
   engrenage Paramètres à droite. Mobile : hamburger avec liste complète.
3. SCROLLBAR dans le thème (globals.css) : webkit-scrollbar + scrollbar-color Firefox.
4. Matière renommée : « R et Python pour la Data » → « Python et R pour la Data ».
5. Vérifié en ligne : build OK, onboarding rejoué au clic (reset onboardingCompleted),
   menu Plus ouvert, capture d'écran de contrôle (navbar + scrollbar).

## Mode hors ligne : durcissement et tests réels (2026-10-05, après le récap)

CORRIGÉ/VÉRIFIÉ (protocole : serveur production coupé, navigation au clic) :
1. SW actif en production MAINTENANT AUSSI sur localhost (avant : jamais actif en local
   → hors ligne impossible à utiliser). layout.tsx : registration si NODE_ENV=production.
2. BUG MAJEUR CORRIGÉ (blocage du hors ligne) : le HTML des pages était pré-caché mais
   PAS leurs chunks JS → toute navigation hors ligne vers une page jamais visitée en
   ligne plantait (« Application error »). sw.js : à l'install, extraction des
   /_next/static/* de chaque HTML pré-caché et pré-cache de ceux-ci.
3. Scripts de /workers/* passés en NETWORK-FIRST (ils étaient cache-first : jamais
   rafraîchis après une mise à jour). Runtimes/questions/exams restent cache-first.
4. Barre de progression au 1er lancement : AppProvider reçoit onProgress de
   loadAllIfNeeded (14 matières, % + label). Les 1 400 questions vont en IndexedDB.
5. Préparation hors ligne (Paramètres) : banque prête d'office ; runtimes de code
   lourds (Python+Pandas ~22 Mo, R ~46 Mo, SQLite ~1 Mo) préchargeables par bouton
   (warmUp = vrai démarrage + eval trivial, remplit le cache SW). Après CHAQUE mise
   à jour de l'app (bump de version SW), les caches sont purgés : re-précharger les
   runtimes une fois en ligne (le panneau l'indique).
6. Testés hors ligne (serveur éteint) : reload app OK, navigation pages OK, démarrage
   quiz depuis la banque OK, réponse + correction avec notes par option OK,
   exécution Python + Pandas OK (worker + runtime servis du cache, test passé).

CONNU / LIMITATION :
- webR (R) : les 6 fichiers sont en cache et servis 200 hors ligne, mais le boot R
  hors ligne se bloque après libRblas.so (webR 0.6, canal post-message ; en ligne
  OK systématiquement). Instrumentation laissée : heartbeats diag dans r-worker.mjs
  + journal REQLOG du SW (postMessage {type:"REQLOG"} via MessageChannel) pour
  reprendre l'enquête. Écarté : CDN (baseUrl local forcé), MIME, canal SAB
  (isolation absente en ligne ET hors ligne dans l'IAB Electron).
- L'IAB Electron n'applique pas l'isolation cross-origin malgré COOP/COEP (false
  dans les deux cas) : non bloquant, à re-vérifier sur Chrome réel et en installé.
- sw.js en v3.4.2. webR 0.6 : baseUrl local forcé (le paquet npm va chercher le
  worker et R sur webr.r-wasm.org) ; build navigateur = dist/webr.js.

## Ajout post-récap (demande utilisateur) : page « Mode Hors Ligne » supprimée

- src/app/offline/page.tsx supprimée ; lien retiré de la Navigation.
- sw.js : /offline retiré du précache, fallback hors ligne des navigations redirigé vers / .
- Réglage « Questions hors ligne par domaine » retiré des Paramètres (le champ reste dans
  les données stockées pour compat, méthodes StorageService supprimées).
- Types session "offline" et store exercises CONSERVÉS (le store exercises reste le
  stockage de la banque préchargée ; anciennes sessions tolérées).
- Vérifié : /offline renvoie 404, navigation sans le lien, banque intacte (1 408).
- Note : un panic Turbopack transitoire (0xc0000142, cache .next périmé) a été résolu en
  supprimant .next et en relançant.

## État : TRAVAIL COMPLET, EN ATTENTE DE VALIDATION UTILISATEUR

- Contenu final : 14 fichiers × 100 questions = 1 400 questions, TOUTES VALIDATEUR VALIDE
  (positions équilibrées, note sur chaque option, longueurs homogènes). Flag de re-import
  bumpé en v7 (re-import automatique au prochain lancement).
- Code : tsc 0 erreur, build de production OK (16 pages), lint aligné.
- Tests de navigation réelle au clic : tous passés (voir détail ci-dessous).
- AUCUN COMMIT : l'utilisateur valide d'abord, puis donnera l'ordre.
- Récapitulatif complet remis à l'utilisateur en fin de session.

## Objectif courant

Transformer l'app en écosystème de révision complet pour les examens IABD (offline-first, sans clé API obligatoire, tous formats de questions, épreuves réelles). GO donné par l'utilisateur le 2026-10-05 pour TOUTES les phases + tests navigation réelle + récap final. Il dort, full access activé, ne veut AUCUNE interruption.

## État d'avancement (implémentation)

### TESTS NAVIGATION RÉELLE : VALIDÉS AU CLIC (2026-10-05, navigateur intégré)

- Onboarding « Commencer sans IA » → tableau de bord complet (streak, objectif, révision due, countdown, banque, v2.6.0).
- Pratique : 14 matières, compteur de banque, difficulté, session locale OK.
- Quiz : QCM simple ✓, multi-réponses ✓, Vrai/Faux ✓, texte à trous ✓, cas pratique (corrigé + grille + score auto-éval) ✓, correction immédiate + explication + notes par option ✓.
- Code Python (Pyodide + Pandas) : exécution réelle, tests visibles/cachés, 3/3 après correction ✓.
- Code SQL (sql.js) : requête exécutée, tableau de résultats, comparaison à la solution ✓.
- Code R (webR) : boot ~40 s, sortie capture.output, erreurs R réelles, 3/3 après correction ✓.
- Résultats : score cohérent (÷ total), erreurs comptées ✓.
- Cahier d'erreurs : 6 entrées, SRS due demain, boutons maîtrise/suppression ✓.
- Import : 7/7 questions validées (tous formats), ajout banque (1000 → 1008) ✓.
- Épreuves réelles : liste, démarrage tronc commun, chrono 2h, mode examen neutre, multi-réponses ✓.
- Paramètres : objectif quotidien (25) et date d'examen persistés, countdown 46 jours ✓.
- Version centralisée (src/version.ts, Header/Footer corrigés).

### BUGS TROUVÉS ET CORRIGÉS PENDANT LES TESTS

1. Timeout du 1er appel runtimes : grâce de 120 s au premier appel du worker (CodeRunnerService.firstCall), délai nominal ensuite.
2. pyodide.js non copié vers public/runtimes → setup-runtimes.mjs corrigé.
3. Pyodide 314 refuse les workers classiques → py-worker.mjs (module worker), ancien supprimé.
4. webR : le webr.mjs du paquet npm est une version NODE (import 'module'/'path') → utiliser dist/webr.js (build navigateur, exports.browser), copié sous public/runtimes/webr/webr.js.
5. webR sans crossOriginIsolated : forcer channelType:"post-message" (SAB indisponible sinon, échec silencieux).
6. API shelter changée en webR 0.6 → sortie via evalRString + capture.output, tests via evalRVoid (stopifnot).
7. Version codée en dur v2.0.4 dans Header/Footer → APP_VERSION de src/version.ts.

### CONTENU (agents)

- Converti + équilibré (25/25/25/25) : les 10 domaines existants (scripts/convert-simple-format.mjs + balance-questions.mjs).
- Notes par option en cours : BIG_DATA ✓, DATA_MINING ✓, DATA_WAREHOUSING ✓ (fichiers 150-167 Ko) ; DEEP_LEARNING, ETHIQUE_IA, VISUALISATION_DONNEES en cours (agents notes 1 et 2).
- À relancer/finaliser : GESTION_PROJET (relancé, anti-blocage 5 parts), BASES_DONNEES_SQL (relancé, réutilise 2 parts existantes), R_PYTHON_DATA (à relancer), ANALYSE_CONCEPTION (à relancer), MACHINE_LEARNING + IA_SYMBOLIQUE notes (à lancer).
- NLP TERMINÉ (2026-10-05, agent) : réécriture intégrale public/questions/NLP.json, 100 questions (58 SINGLE_CHOICE + 12 MULTI + 12 VF + 8 TROUS + 5 CODE python + 5 CAS), ids nlp_001..nlp_100, français accentué (2 508 caractères accentués), notes sur chaque option, positions équilibrées A15/B14/C14/D15, codes testés en exécution réelle (15/15 asserts dont 5 cachés), validateur VALIDE ✔. Remarque : la somme littérale 60+12+12+8+5+5 faisait 102, SINGLE ramené à 58 pour tenir le total 100 imposé. C'est le premier fichier multi-types : modèle à suivre pour les autres domaines.
- APRÈS contenu complet : bump LOADED_FLAG v6 → v7 (PreloadedQuestionsService) pour re-import chez l'utilisateur, valider tous les fichiers, build final.

## Décisions validées (2026-10-05)

Offline-first sans backend ; génération sans clé API via prompt exportable + import ; runtimes Pyodide/webR/sql.js installés ; corrigés des 3 épreuves ; 4 nouvelles matières ; rework des 10 domaines existants ; standard qualité : positions équilibrées + longueurs homogènes + note par option.

## Rappels permanents

Jamais de tiret cadratin ; français ; test final « Live » déclenché par l'utilisateur (ici il a demandé que JE fasse la navigation au clic avant son retour) ; jamais de commit sans ordre explicite.
