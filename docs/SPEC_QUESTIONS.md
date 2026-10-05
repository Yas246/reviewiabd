# Spécification : banque de questions Review IABD

Ce document définit le format et les règles de qualité OBLIGATOIRES de tout fichier
de questions de l'application (dossier `public/questions/`).

## Format général

Chaque fichier est un tableau JSON de 100 questions, encodé UTF-8 (français accentué),
indenté avec 2 espaces. Chaque question est un objet avec :

```json
{
  "id": "ac_001",
  "domain": "ANALYSE_CONCEPTION",
  "type": "SINGLE_CHOICE",
  "question": "énoncé de la question",
  "context": "(optionnel) énoncé long de mise en situation",
  "answers": [
    {"id": "ac_001_a", "text": "option A", "isCorrect": false, "note": "confusion que cette option piège"},
    {"id": "ac_001_b", "text": "option B", "isCorrect": true,  "note": "pourquoi c'est juste"},
    {"id": "ac_001_c", "text": "option C", "isCorrect": false, "note": "confusion que cette option piège"},
    {"id": "ac_001_d", "text": "option D", "isCorrect": false, "note": "confusion que cette option piège"}
  ],
  "explanation": "explication synthétique de la bonne réponse (2-3 phrases), sans jamais citer de lettres d'options",
  "difficulty": "medium",
  "tags": ["uml", "diagramme-de-classes"]
}
```

Champs `id` : `<prefixe>_<numéro>` (ex. `ac_042`). Les `id` d'options : `<idQuestion>_a`, `_b`, `_c`, `_d`.

## Types de questions et leurs champs spécifiques

### SINGLE_CHOICE (QCM, une seule bonne réponse)
- 4 options, EXACTEMENT une `isCorrect: true`.

### MULTIPLE_CHOICE (multi-réponses, style tronc commun « la ou les lettres »)
- 4 options, 2 ou 3 `isCorrect: true`.

### TRUE_FALSE (vrai ou faux)
- 2 options exactement, dans cet ordre d'id :
```json
"answers": [
  {"id": "xx_010_v", "text": "Vrai",  "isCorrect": false, "note": "..."},
  {"id": "xx_010_f", "text": "Faux", "isCorrect": true,  "note": "..."}
]
```
- La question est une affirmation à juger ; les notes expliquent ce qui est vrai ou faux dans l'affirmation.

### FILL_BLANK (texte à trous)
- L'énoncé contient `___` (trois underscores) à chaque trou.
```json
"question": "Le théorème ___ garantit qu'un système distribué ne peut garantir que deux des trois garanties sur ___ .",
"blanks": [{"accepted": ["CAP"]}, {"accepted": ["les trois", "3"]}]
```
- `accepted` liste plusieurs variantes acceptées (casse/accents ignorés côté app).

### CODE (exercice de code vérifié par exécution)
```json
"code": {
  "language": "python",        // "python" | "r" | "sql"
  "setup": "donnees = [400, 1200, 800, 950, 1500, 700]",   // exécuté avant le code utilisateur
  "starter": "def moyenne(valeurs):\n    # à compléter\n    pass",
  "solution": "def moyenne(valeurs):\n    return sum(valeurs)/len(valeurs)",
  "timeLimitMs": 10000,
  "tests": [
    {"name": "Cas simple", "hidden": false, "code": "assert moyenne([400, 1200]) == 800"},
    {"name": "Test caché 1", "hidden": true, "code": "assert abs(moyenne([1, 2, 4]) - 7/3) < 1e-9"}
  ]
}
```
- Python : chaque test est du code Python avec `assert`.
- R : chaque test est du code R avec `stopifnot(...)` ; le code utilisateur définit des variables/objets.
- SQL : pas de `tests` ; `setup` contient les `CREATE TABLE` + `INSERT`, et `solution` est la requête attendue.
  L'application compare le résultat de l'étudiant à celui de la solution. Pour SQL, laisser `tests: []`.
- Au moins 1 test caché (anti-triche), 2 à 4 tests au total.
- Pour Python : importer si besoin (`import pandas as pd`) dans `setup` ou `starter`.

### CASE_STUDY (cas pratique rédigé avec corrigé + grille d'auto-évaluation)
```json
{
  "type": "CASE_STUDY",
  "context": "Énoncé long du cas (mise en situation complète)...",
  "question": "Consigne générale du cas",
  "subQuestions": [
    {
      "id": "sq-1",
      "question": "Première sous-question",
      "answer": "Corrigé détaillé de la sous-question (5-10 lignes)",
      "rubric": ["point vérifiable 1", "point vérifiable 2", "point vérifiable 3"]
    }
  ],
  "answers": [],
  "explanation": "synthèse méthodologique du cas"
}
```
- 2 à 4 sous-questions par cas ; rubric = 3 à 5 points cochables par sous-question.
- `answers` reste un tableau vide.

## Règles de qualité STRICTES

1. **Position aléatoire** : sur l'ensemble du fichier, la bonne réponse des SINGLE_CHOICE
   doit se répartir à peu près équitablement entre les positions A, B, C, D
   (l'application applique de toute façon un rééquilibrage automatique par script,
   mais écris déjà de façon variée).
2. **Longueurs homogènes** : les distracteurs doivent avoir la même longueur et le même
   niveau de détail que la bonne réponse. JAMAIS de bonne réponse « plus précise » ou
   « plus complète » que les autres : ce serait trivable.
3. **Distracteurs plausibles** : chaque mauvaise réponse = une confusion fréquente et
   réaliste du cours (pas d'absurdité).
4. **Note sur CHAQUE option** des types SINGLE/MULTI/VF : une phrase expliquant la
   confusion (pour une mauvaise) ou confirmant (pour la bonne).
5. **Explication sans lettres** : le champ `explanation` ne doit JAMAIS contenir
   « l'option A », « la réponse B », etc.
6. **Français impeccable et accentué** ; vocabulaire exact du programme IABD ;
   une notion par question.
7. **Difficulté** : environ 30 % easy, 50 % medium, 20 % hard, répartie au fil du fichier.
8. **Tags** : 1 à 3 tags pertinents en minuscules (ex. ["backpropagation"]).
9. **Pas de doublons** : deux questions ne doivent pas tester deux fois la même chose
   avec les mêmes mots.
10. **Pas de référence aux lettres** dans les questions elles-mêmes (« laquelle des
    réponses suivantes » ok ; « l'option C » interdit).

## Validation obligatoire

Après écriture du fichier, lancer :

```
node scripts/validate-questions.mjs public/questions/<FICHIER>.json 100
node scripts/balance-questions.mjs public/questions/<FICHIER>.json
```

Le validateur doit répondre `VALIDE ✔` (corrige jusqu'à l'obtenir). Le script de
balance réordonne ensuite les options de façon équilibrée (le relancer avant de finir).
