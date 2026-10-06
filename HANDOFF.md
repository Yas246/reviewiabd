# HANDOFF.md : Review IABD

Dernière mise à jour : 2026-10-06 (synchronisation : UNE base Supabase pour tous les utilisateurs, branchée au build via variables d'environnement, plus aucune config dans l'interface)

## Synchronisation multi-appareils (2026-10-06, ARCHITECTURE CORRIGÉE : env au build)

- Correction demandée par l'utilisateur : PAS de configuration dans l'interface. UNE
  base Supabase (celle du propriétaire de l'app) sert TOUS les utilisateurs ; eux ne
  font que créer un compte (e-mail ou Google). URL + clé anon incrustées au build via
  NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY (.env.local en dev,
  variables Vercel en prod, .env.example documenté). Si absentes, la carte
  Synchronisation ne s'affiche pas du tout.
- SyncService.ts : client Supabase depuis les env ; auth e-mail/mot de passe +
  Google OAuth ; réplique ligne à ligne (voir détails ci-dessous conservés) ;
  ombre d'horodatages (sync_shadow) ; auto-sync lancement / fin de quiz / import /
  retour réseau ; bouton manuel.
- Réplique : sync_rows (user_id, store, id, data, updated_at). Union : sessions,
  exams, practiceQuizzes, questions importées, favorites. LWW : mistakes, settings.
  MAX(questionsAnswered) par date : dailyStats. Non synchronisés : banque préchargée,
  statistics (recalculées), cron.
- Commits : 9f15d5e (feature) puis 0274952 (env au build). sw.js v3.6.1.
- RESTE (côté utilisateur/propriétaire) : créer le projet Supabase → exécuter
  docs/supabase-sync.sql → mettre URL + clé anon dans .env.local ET dans les
  variables Vercel → redéployer → tester PC ↔ téléphone (Google : activer le
  provider + redirect URLs, cf. commentaire du script SQL).

## Synchronisation multi-appareils : conception (2026-10-06)

- Demande : retrouver sa progression entre PC et téléphone. Choix retenu (discussion) :
  Supabase (Auth + table) du projet DE l'utilisateur, auth OPTIONNELLE, app 100 % locale
  par défaut ; PAS un gros JSON : réplique LIGNE À LIGNE pour convergence naturelle.
- SyncService.ts : client Supabase créé depuis l'URL + clé anon collées dans
  Paramètres (localStorage sync_cfg_url/key). Auth : e-mail + mot de passe (signUp /
  signIn) ET Google OAuth (signInWithOAuth provider google, redirect → /settings).
- Réplique : table sync_rows (user_id, store, id, data jsonb, updated_at ; PK
  user_id,store,id). Stores répliqués : sessions, exams, practiceQuizzes, QUESTIONS
  (importées : demande utilisateur explicite), favorites, mistakes, dailyStats,
  settings. La banque préchargée (exercises) et statistics (recalculées) NON sync.
- Fusion par store : union par clé pour l'append-only (sessions/exams/quiz/
  questions/favoris : les quiz des deux appareils coexistent et restent rejouables) ;
  LWW via ombre locale d'horodatages (localStorage sync_shadow) pour mistakes et
  settings ; MAX(questionsAnswered) par date pour dailyStats (progression monotone).
- Rythme automatique (demande utilisateur) : au lancement (autoPullOnLaunch dans
  AppProvider si onboardingCompleted), APRÈS chaque fin de quiz/examen (hook dans
  handleQuizCompletion) et après un import de questions (notifyProgressChanged,
  debouncé 4 s, silencieux), et au RETOUR du réseau (hookOnlineListener). Bouton
  manuel "Synchroniser maintenant" (+ reload) dans Paramètres.
- UI : src/components/features/SyncSettings.tsx, carte dans Paramètres entre la
  préparation hors ligne et Gestion des Données : config projet, compte (e-mail,
  Google), état, bouton de synchro, déconnexion.
- Script SQL à exécuter chez l'utilisateur : docs/supabase-sync.sql (table + RLS
  auth.uid() = user_id + note config Google OAuth et redirect URLs).
- Vérifié au clic : carte visible, dashboard inchangé sans compte, fausse config →
  "Failed to fetch" affiché proprement puis nettoyée. sw.js v3.6.0.
- RESTE (côté utilisateur) : créer le projet Supabase, exécuter le SQL, coller
  URL + clé anon dans Paramètres, tester PC ↔ téléphone (et activer Google si voulu).

## Product Tour généralisé (2026-10-05, FAIT ET VÉRIFIÉ AU CLIC)

- Demande utilisateur : des visites guidées aussi sur Pratique, Examen et Importer.
- ProductTour devient générique : props id + steps (+ flagKey optionnel), drapeau
  localStorage tour_done_<id>, rejeu via sessionStorage tour_replay_<id>.
  Accueil : id home, flagKey tour_done_v1 (compatibilité, pas de re-déclenchement).
- Pratique : 7 étapes (source, matière, nombre, difficulté, commencer, historique),
  attributs p-* ; Examen : 5 étapes (source, format 40q/2h ou 20q/1h, matière si
  concerné, commencer), attributs e-* ; Importer : 4 étapes (principe sans clé,
  étapes 1-2-3), attributs i-etape1..3.
- ui/Card : les attributs (data-tour...) sont désormais transmis (CardProps étend
  HTMLAttributes).
- Paramètres : rubrique « Visites guidées » avec 4 boutons (Accueil, Pratique,
  Examen, Importer) : chacun efface le drapeau de sa page, pose tour_replay_<id>
  et navigue vers la page.
- Vérifié au clic : tours 7/5/4 étapes actifs sur les trois pages, projecteur
  correct (capture étape matière), Échap pose le flag, boutons Paramètres présents.
- sw.js en v3.5.2.

## Audit final des 11 fiches (2026-10-05, FAIT)

- Passerelle token par token sur les 11 fiches ; ajout de 10 entrées utiles :
  PYTHON : f-strings, compréhensions de liste, tuples/ensembles (46 entrées) ;
  PANDAS : pd.crosstab (83) ; NUMPY : np.where, np.unique, broadcasting (53) ;
  R : tri avec order() dans Data frames (70) ; SQL : fonctions fenêtrées OVER,
  CTE WITH (43). Validateurs : 11/11 VALIDE ✔. R.json sert déjà à jour
  (network-first, pas de rebuild requis pour public/).
- Cas pratique (CASE_STUDY) expliqué à l'utilisateur : auto-évaluation par grille,
  critères formulés « ou équivalent » (aucune exécution) ; reste à faire si demandé :
  ré-accenter les libellés des grilles (vectorisee → vectorisée).

## Diagnostic explications de code : la vraie cause = setup jamais affiché (2026-10-05)

- Retour utilisateur sur rpd_047 (ventes) : l'explication citait 3000 + 2500 + 4000
  alors que l'ÉNONCÉ ne parle d'aucun chiffre. Cause : le champ code.setup (les données :
  DataFrame/vecteur/table SQL) sert aux tests mais n'était JAMAIS affiché (ni question,
  ni correction). 31 exercices CODE sur 33 ont un setup caché. La banque est complète :
  rien ne manque dans les fichiers, c'est un défaut d'AFFICHAGE.
- AUDIT : docs/audit-explications-code.md (les 33 CODE : id, setup, explication
  actuelle). Le vrai problème validé par l'utilisateur : les données du setup n'étaient
  jamais affichées (l'explication commentait des valeurs invisibles).
- FIX APPLIQUÉ : QuestionCard affiche un bloc « DONNÉES DE L'EXERCICE » (classe
  .code-block, thème-conscient, JetBrains Mono) au-dessus de l'éditeur quand setup est
  non vide. Vérifié au clic : session Python et R → bloc visible au-dessus de CodeMirror.
  (Un bloc « Vérifications attendues » avait aussi été testé puis RETIRÉ à la demande
  de l'utilisateur ; seul le bloc Données est conservé.)

## Reformulation des 33 exercices CODE (2026-10-05, FAIT À LA MAIN, VALIDATEUR VERT)

- Moule validé par l'utilisateur sur rpd_048 : énoncé qui RELIE les données (« on
  dispose du vecteur revenus donné ci-dessous ») + explication en 3 temps (Les
  données / La solution / Sur les données avec le calcul chiffré complet).
- Appliqué à la main (PAS d'agents, demande explicite) : R_PYTHON_DATA 16, SQL 12,
  NLP 5. 29 énoncés re-reliés aux données, 33 explications réécrites. CHIFFRES
  VÉRIFIÉS À LA MAIN contre setup/solution/tests (ex. ventes : 1000×3 + 2500×1 +
  800×5 = 9500 ; SQL : totaux par client, compteurs par film, moyennes par cours).
- Piège corrigé : le validateur signale les énoncés trop proches (préfixe commun
  ~40 car.) → ouvertures différenciées (« En Python, la liste... » / « En R, le
  vecteur... ci-dessous servira de jeu de données » etc.).
- Validateurs : 14/14 fichiers VALIDE ✔. Flag LOADED_FLAG bumpé v7 → v8
  (PreloadedQuestionsService) pour forcer le ré-import de la banque ; vérifié dans
  IndexedDB (store exercises, 1400 questions) : rpd_047/048 avec les nouveaux textes.
- sw.js en v3.5.1. Pour voir : reload x2 puis session Pratique Python et R.

## Onboarding réorganisé (2026-10-05, FAIT ET VÉRIFIÉ AU CLIC)

- ÉTAPE 1 = Préparation hors ligne (OfflinePrep), aucune mention de fournisseur ;
  lien « Terminer maintenant (l'IA reste optionnelle) » qui finit l'onboarding.
- ÉTAPE 2 = Brancher l'IA (optionnel) : fournisseur + clé, « Continuer » exige une clé
  valide, bouton « Passer : réviser sans IA » = handleFinish direct.
- ÉTAPE 3 = modèle (si clé). handleSkip refait handleFinish (fin sans clé).
- Vérifié au clic (onboarding réarmé via IndexedDB settings, clé "user") :
  étape 1 → Continuer → étape 2 → Passer → dashboard.
- Pour revoir l'onboarding en test : IndexedDB ReviewIABD → store settings →
  enregistrement clé "user" → onboardingCompleted=false (clé hors-ligne, pas keyPath).

## Police : Manrope PARTOUT (demande utilisateur, 2026-10-05, FAIT ET VÉRIFIÉ)

- layout.tsx : Space Grotesk remplacé par Manrope (200-800). ATTENTION : les classes de
  variables next/font doivent être sur <html> (pas <body>) car :root (globals.css)
  référence var(--font-manrope) : sur body, la résolution de :root échouait.
- globals.css : --font-sans/--font-serif/--font-mono pointent TOUS sur Manrope (les 28
  fichiers qui posent font-mono comme style « technique » passent donc en Manrope sans
  retouche). NOUVEAU token --font-code = JetBrains Mono, réservé au VRAI code :
  règle unlayered `.code-block, pre, code, .font-code { font-family: var(--font-code) !important }`
  (!important nécessaire : les utilitaires Tailwind rivalisent à spécificité égale selon
  les couches). QuestionCard : sortie/erreurs d'exécution passées en font-code.
- Vérifié : h1/titres/UI = Manrope, blocs de code fiches = JetBrains Mono, fond clair OK.

## PIÈGE OPÉRATIONNEL CRITIQUE : bump SW obligatoire à CHAQUE build

- Turbopack réutilise les MÊMES noms de chunks CSS/JS entre builds (contenus différents).
  Le SW pré-cachant HTML+chunks à l'install, sans bump de version il ressert l'ANCIEN
  contenu sous le même nom : modifications invisibles (une feuille 24 Ko sans utilitaires
  a ainsi remplacé le vrai CSS 64 Ko : tous les styles utilitaires disparaissaient).
- Règle : après chaque modification + npm run build, incrémenter les 4 noms de caches de
  public/sw.js (v3.4.3 → ... → v3.4.6 aujourd'hui), puis reload x2 côté navigateur.
  Les purges effacent aussi les runtimes préchargés : re-précharger une fois (le panneau
  Paramètres l'indique).

## Fix IDM : « Précharger » passe par le SERVICE WORKER (2026-10-05, FAIT ET VÉRIFIÉ)

- Cause : le bouton « Précharger » (OfflinePrep) appelait warmUp() = VRAI boot Pyodide,
  dont le loader va chercher python_stdlib.zip sur le réseau : IDM interceptait ce .zip,
  le téléchargement était volé, Pyodide démarrait sans stdlib (« Failed to import
  encodings module » côté console).
- Fix : le bouton appelle désormais precacheViaSW() : le SW télécharge LUI-MÊME les 11
  fichiers Python (idem R et SQL) dans RUNTIMES_CACHE, invisible pour les gestionnaires
  de téléchargement ; progression affichée fichier par fichier ; precacheViaSW rejette
  maintenant si un fichier échoue ; état « PRÊT HORS LIGNE » uniquement après
  vérification isCached. Une fois en cache, les boots des workers sont servis
  cache-first par le SW (plus jamais de réseau → IDM ne peut plus rien casser).
- Vérifié au clic dans Paramètres : Python + Pandas → PRÊT HORS LIGNE, les 11 fichiers
  pyodide présents en cache (python_stdlib.zip incluse).
- PARCOURS UTILISATEUR COMPLET VALIDÉ APRÈS CE PRÉCHARGEMENT : Pratique → banque locale
  → matière Python (R/PY) → session 15 questions → question 1 = exercice code pandas →
  saisie dans l'éditeur CodeMirror → « Exécuter et vérifier » → boot Pyodide depuis le
  cache SW → TESTS 3/3 PASSÉS (test caché compris) → Valider → correction + explication.
- Reste côté utilisateur : re-précharger aussi R et SQLite (purge v3.4.6), et en
  ceinture de sécurité ajouter localhost:3000 aux exclusions IDM (Options IDM → liste
  d'exclusion). L'ancien runtime pyodide cassé (sans stdlib) est réparé par la purge +
  re-préchargement.

## Navigation fiches ⇄ historique (2026-10-05, retours utilisateur, CORRIGÉ ET VÉRIFIÉ)

- Retour utilisateur : depuis une fiche, le retour navigateur (réflexe mobile) quittait
  TOUTE la section fiches (retour à la page précédente hors /cheatsheets).
- Fix : ouvrir une fiche fait window.history.pushState({cheatsheetId}), un écouteur
  popstate ferme/rouvre la fiche selon l'état, le bouton « Toutes les fiches » fait
  history.back() (pile propre), et au chargement on restaure la fiche depuis
  history.state (reload au milieu d'une fiche OK).
- Vérifié au clic : fiche SQL → retour navigateur = LISTE sur /cheatsheets (pas de
  sortie) ; avant navigateur = la fiche se rouvre ; bouton « Toutes les fiches » = liste,
  URL inchangée. tsc 0 erreur, build relancé, serveur production relancé.

## Fix « fiches illisibles en mode clair » (2026-10-05, CORRIGÉ ET VÉRIFIÉ)

- Cause exacte : les blocs de code des fiches avaient un fond sombre codé en dur
  (#0d1117) et des couleurs de syntaxe claires codées en dur, mais la couleur du texte
  de base du code n'était PAS fixée : elle héritait de --ink-primary. En sombre : clair
  sur sombre, lisible. En clair : encre presque noire sur fond noir → seul le texte
  colorisé (chaînes, nombres) restait visible, le reste du code disparaissait.
- Fix : blocs de code thème-conscients. globals.css : variables --code-* (bg, border,
  plain, kw, str, com, num) définies dans :root (éditeur clair #f6f8fa, texte #24292f,
  kw #0550ae, str #0a7d32, com #6e7781, num #b3540e) ET dans [data-theme="dark"]
  (valeurs nuit inchangées : #0d1117, #c9d1d9, #82aaff, #a5d6a7, #7a8592, #f78c6c).
  Classe .code-block + tokens .tok-kw/.tok-str/.tok-com/.tok-num.
- cheatsheets/page.tsx : highlightCode émet les classes .tok-* (plus de couleurs en dur
  dans le HTML injecté), les deux <pre> (vue fiche + résultats de recherche) utilisent
  .code-block.
- Vérifié au navigateur sur le serveur production : Pandas en CLAIR (fond clair, code
  complet lisible, syntaxe adaptée), Pandas en SOMBRE (identique à avant), fiche R en
  CLAIR (mots-clés bleus, chaînes vertes, nombres orange, commentaires italiques).
- Piège au passage : le port 3000 tournait en `next start` (production) → le build a
  été relancé (npm run build) puis `npm start` relancé en tâche de fond. Penser à
  rebuillder après chaque modif avant de tester sur :3000 (le SW ne sert que du
  production ; reload x2 pour laisser le SW se mettre à jour).

## Design nouveau : IDENTITÉ « AURORE » (v2 du design, appliquée, en attente de validation)

Retour utilisateur sur la v1 « Clarté » : trop simple, trop générique. Recherche en ligne
(aurora/mesh + glassmorphism 2025, avis anti-slop) → identité « Aurore » :

- Sombre « Nuit d'aurore » : encre bleu-vert #0a0d12, cartes verre solide #11161d avec
  liseré interne lumineux, AURORE en fond (3 nappes radiales fixées : émeraude, cyan, or)
  + grain de papier à 3,5 % (fixed, pointer-events-none). Accent ÉMERAUDE #34d399.
- Clair « Jour d'examen » : silver #eef0f4, cartes blanches, mêmes nappes à faible
  opacité, accent émeraude profond #0d9463. AUCUN beige+laiton (palette interdite).
- Police : Space Grotesk (display + UI, Google Fonts) + JetBrains Mono. Outfit retiré.
- Navbar desktop : PILULE FLOTTANTE en verre (top-4, rounded-full, backdrop-blur-xl,
  max-w-4xl) ; mobile : barre fine en verre avec BASCULE DE THÈME à côté du hamburger
  (retour utilisateur : impossible de changer de thème sur mobile).
- ProductTour ajouté : 8 étapes (projecteur + carte), 1re visite auto sur le dashboard,
  rejouable via Paramètres → Revoir la visite guidée ; Échap/←/→ ; carte responsive
  (corrigeait un débordement du bouton Suivant signalé) ; attributs data-tour sur
  dashboard (today/revision/exam/modes/stats) + navbar (nav-plus) + ThemeToggle (theme).
- Cartes du haut du dashboard : hauteur égale rétablie (h-full, retour utilisateur).
- Matière renommée « Python et R » (types + prompts IA).
- Vérifié : tsc OK, build OK, captures desktop sombre/clair et mobile (dashboard,
  bascule, menu). Fonctionnalités intactes.
- En attente : validation utilisateur, puis commit design (et commit ProductTour).

## Commits locaux effectués (2026-10-05) — base stable avant design

## Commits locaux effectués (2026-10-05) — dépôt propre

- b567a10 fix : thème Tailwind 4 complet, scrollbar thémée, en-têtes sécurité et version centralisée
- 94af710 fix sw : pré-cache des chunks de chaque page, workers en network-first, cache runtimes
- b0ee29e feat : app offline-first (banque locale, formats multi/VF/trous/code/cas pratiques, cahier d'erreurs, SRS, streaks, import sans clé API, épreuves réelles, cheat sheets)
- 6ed9a40 contenu : 1400 questions validées sur 14 matières et 8 cheat sheets (348 entrées)
- 8d99ae2 docs : README à jour, HANDOFF, spécifications, scripts qualité et build Vercel
- PAS de push (origin non synchronisé, décision utilisateur). PAS de mention IA dans les messages.

## Vercel : prêt

- vercel.json : buildCommand = npm run setup:runtimes && npm run build (télécharge et
  installe les runtimes Python/R/SQL dans public/runtimes au build, car le dossier est
  gitignoré en local). En-têtes COOP/COEP servis par next.config.
- Le SW (v3.4.3) s'active en production : l'app déployée est utilisable hors ligne après
  une première visite + préchargement des runtimes dans Paramètres.
- Suite à une mise à jour déployée : caches SW purgés → re-précharger les runtimes une
  fois en ligne.

## Phase suivante : DESIGN NOUVEAU (pas un redesign)

- Utilisateur valide la base committée ; il lancera la phase design avec les Taste
  Skills (design-taste-frontend etc.), AUTORISATION donnée pour rechercher en ligne des
  designs adaptés (révision/examen, sombre académique actuel « Laboratory at Night »).
- Contrainte à respecter : ne pas casser le offline (SW, runtimes), la banque locale,
  le cahier d'erreurs/SRS, ni l'import. Thème dark only actuel à remplacer par le
  nouveau design (variables CSS centralisées : globals.css + @theme).

## Cheat Sheets (demande utilisateur)

- Page /cheatsheets : liste des fiches par matière, vue fiche ouverte (sections, items
  « ça sert à quoi / code / piège »), recherche DANS la fiche ouverte et recherche
  TRANSVERSALE sur toutes les fiches.
- 11 fiches (public/cheatsheets/*.json, validateur scripts/validate-cheatsheets.mjs),
  toutes VALIDE, 546 entrées au total, construites en croisant les planches DataCamp PDF
  fournies par l'utilisateur (Documents/ : python-basics, pandas + pandas2, numpy, scipy,
  R basics, tidyverse, data.table, sql-for-data-science, ML) :
  PYTHON 20 sections/43 (langage pur, ordre DataCamp), PANDAS 16/82 (fiche SÉPARÉE,
  demande utilisateur), NUMPY 12/50, SCIPY 10/42, R 16/62 (enrichie tidyverse/dplyr/
  data.table/ggplot2), SQL 11/41 (enrichie DataCamp), MACHINE_LEARNING 10/54 (enrichie
  sklearn), DEEP_LEARNING 10/43, ANALYSE_CONCEPTION 9/46, GESTION_PROJET 9/41,
  BIG_DATA 9/42. Rendu des items en tableau (sujet à gauche, code à droite).
  sw.js : /cheatsheets/* en NETWORK-FIRST (fraîcheur, secours cache hors ligne).
  Absentes (pas de PDF fourni) : Keras/PyTorch, PySpark, scikit-learn dédié.
- Accès : menu « Plus » (premier entré) + mobile + carte sur le tableau de bord.
- SW : /cheatsheets/* ajouté à la règle runtime-asset (cache-first) → consultable hors
  ligne une fois visité.
- Matière renommée aussi dans les prompts IA : « Python et R: data frames... ».
- SQL enrichie (2026-10-05) par croisement avec la planche DataCamp « SQL for Data
  Science » (Documents/sql-for-data-science.pdf) : 33 → 41 items, sections conservées.
  Ajouts : ORDER BY (ASC/DESC), alias AS, LIMIT/TOP, CASE WHEN dans une agrégation,
  GROUP BY multi-colonnes, COUNT(DISTINCT), erreurs classiques d'agrégation, fonctions
  de date (CURRENT_DATE/INTERVAL, variantes SQLite/MySQL). Enrichis : ordre d'exécution
  logique (FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT) en note,
  NOT LIKE, NOT IN, BETWEEN sur dates, coquille « AVG/SUM/AVG » corrigée. Valide ✔.
- 2 NOUVELLES fiches depuis les PDF DataCamp de l'utilisateur (2026-10-05) : NUMPY
  (public/cheatsheets/NUMPY.json, id NUMPY, 12 sections / 50 items) et SCIPY
  (public/cheatsheets/SCIPY.json, id SCIPY, 10 sections / 42 items). Contenu repris de
  Documents/Numpy_Cheat_Sheet.pdf et Documents/SciPy_Cheat_Sheet.pdf avec formulation
  française originale (pas de copie verbatim). NumPy : création, types/inspection, E-S,
  arithmétique vectorisée, comparaisons, stats, slicing/indexation booléenne et fancy,
  reshape/axes, empilement/séparation, copie/tri, pièges. SciPy : linalg (inverse,
  normes, systèmes, fonctions de matrices, décompositions), sparse (csr/csc/dok,
  spsolve, eigs/svds), utilitaires NumPy (mgrid, poly1d, vectorize, select), misc
  combinatoire/dérivées, pièges de dépréciation (np.matrix déprécié, scipy.misc
  supprimé, scipy.linalg vs numpy.linalg). Deux fichiers VALIDE ✔.

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
