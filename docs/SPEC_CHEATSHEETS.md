# Spécification : Cheat Sheets Review IABD

Les cheat sheets sont des fiches de référence rapide : « ça sert à quoi / comment on
l'écrit / pièges ». Chaque matière = un fichier JSON dans `public/cheatsheets/`.

## Format

```json
{
  "id": "PYTHON",
  "title": "Python et Pandas",
  "description": "Référence rapide : lecture de fichiers, nettoyage, groupby...",
  "sections": [
    {
      "title": "Charger et inspecter",
      "items": [
        {
          "what": "Lire un fichier CSV dans un DataFrame",
          "code": "import pandas as pd\ndf = pd.read_csv('fichier.csv')",
          "note": "df.head() affiche les 5 premières lignes."
        }
      ]
    }
  ]
}
```

- `what` : à quoi ça sert (une ligne, en français).
- `code` : comment on l'écrit (peut être omis pour les définitions pures ; alors mettre
  l'essentiel dans `note`).
- `note` (optionnel) : précision, piège fréquent, rappel de cours.
- 4 à 10 sections par fiche, 3 à 8 items par section.
- Français accentué, exemples courts et corrects (ils servent de référence).
- `id` en majuscules, identique au nom de fichier : `PYTHON.json` → id `PYTHON`.

## Validation

Après écriture : `node scripts/validate-cheatsheets.mjs public/cheatsheets/<FICHIER>.json`
et vérifier que le JSON parse : `node -e "JSON.parse(require('fs').readFileSync('...','utf8'))"`.
