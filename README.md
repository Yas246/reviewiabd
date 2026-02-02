<div align="center">

# Review IABD

**Application PWA de révision intelligente pour le domaine IABD**

[![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![PWA](https://img.shields.io/badge/PWA-Enabled-5A0458?style=for-the-badge&logo=pwa)](https://www.pwabuilder.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

*Génération de QCM par IA • Mode hors ligne • Suivi de progression*

</div>

---

## 📋 Table des matières

- [🎯 Vue d'ensemble](#-vue-densemble)
- [✨ Fonctionnalités](✨-fonctionnalités)
- [🚀 Démarrage rapide](#-démarrage-rapide)
- [🏗️ Architecture](#️-architecture)
- [🎨 Design System](#-design-system)
- [📚 Les domaines IABD](#-les-domaines-iabd)
- [📁 Structure du projet](#-structure-du-projet)
- [🔧 Configuration](#️-configuration)
- [📦 Déploiement](#-déploiement)
- [🛠️ Stack technique](#️-stack-technique)

---

## 🎯 Vue d'ensemble

**Review IABD** est une Progressive Web Application (PWA) permettant aux étudiants de réviser le domaine **IABD** (Intelligence Artificielle et Big Data) via des QCM générés par intelligence artificielle.

### Points forts

- 🤖 **Génération IA** : Questions créées dynamiquement via OpenRouter API
- 📱 **100% Offline** : Fonctionne sans connexion grâce à IndexedDB et Service Workers
- 📊 **Suivi avancé** : Statistiques détaillées et historique des examens
- 🎨 **Design immersif** : Thème "Laboratory at Night" optimisé pour la concentration
- ⚡ **Performance** : Next.js 16 avec Turbopack pour des chargements instantanés

---

## ✨ Fonctionnalités

### 🎓 Modes d'apprentissage

| Mode | Description | Limite de temps |
|------|-------------|-----------------|
| **Pratique** | Révisez à votre rythme par domaine | ❌ Non |
| **Examen** | Simulation d'examen complet ou par domaine | ⏱️ 2h |
| **Favoris** | Révisez vos questions marquées | ❌ Non |
| **Hors ligne** | Exercices téléchargés pour usage offline | ❌ Non |

### 📈 Suivi de progression

- **Tableau de bord** avec statistiques globales en temps réel
- **Historique des examens** avec suivi des tentatives et meilleurs scores
- **Progression par domaine** avec scores moyens et temps d'étude
- **Système de favoris** pour marquer les questions importantes

### 🧩 Gestion des questions

- **10 domaines IABD** couverts
- **Génération par batch** de 10 questions avec barre de progression
- **QCM à choix unique** avec explications détaillées
- **Difficulté adaptative** (facile, moyen, difficile)
- **Tags et métadonnées** pour un filtrage précis

### 🔧 Paramétrage

- **Configuration initiale** (onboarding) en 2 minutes
- **Choix du modèle IA** avec support de modèles gratuits
- **Gestion de la clé API** en toute sécurité
- **Préférences utilisateur** persistantes en IndexedDB

---

## 🚀 Démarrage rapide

### Prérequis

- **Node.js** 18.x ou supérieur
- **npm** ou **yarn**
- **Clé API OpenRouter** ([obtenir ici](https://openrouter.ai/))

### Installation

```bash
# Cloner le repository
git clone https://github.com/votre-username/review-iabd.git
cd review-iabd

# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev
```

L'application sera disponible sur [http://localhost:3000](http://localhost:3000)

### Build de production

```bash
# Créer un build optimisé
npm run build

# Lancer le serveur de production
npm start
```

---

## 🏗️ Architecture

### Flux de données

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  User UI    │─────▶│  App Router  │─────▶│ IndexedDB   │
│  (React)    │◀─────│  (Next.js)   │◀─────│  (idb)      │
└─────────────┘      └──────────────┘      └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ OpenRouter   │
                     │ API (IA)     │
                     └──────────────┘
```

### Services

| Service | Responsabilité |
|---------|----------------|
| **IndexedDBService** | Stockage persistant (sessions, examens, exercices) |
| **StorageService** | Paramètres utilisateur et préférences |
| **OpenRouterService** | Génération de questions via IA |
| **StatisticsService** | Calcul et mise à jour des statistiques |

### Modèles de données

```typescript
// Question générée par IA
interface Question {
  id: string;
  domain: Domain;
  type: QuestionType;
  question: string;
  answers: Answer[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
}

// Session de quiz en cours
interface QuizSession {
  id: string;
  type: "practice" | "exam" | "offline";
  questions: Question[];
  userAnswers: Record<string, UserAnswer>;
  status: QuizSessionStatus;
  timeLimit?: number;
}

// Examen sauvegardé avec historique
interface SavedExam {
  id: string;
  name: string;
  type: "full" | "domain";
  attempts: ExamAttempt[];
  bestScore: number;
  bestAttemptId: string;
}
```

---

## 🎨 Design System

### Thème "Laboratory at Night"

L'application utilise un thème sombre exclusif conçu pour une immersion totale et une réduction de la fatigue visuelle.

#### Palette de couleurs

```css
/* Primary Colors */
--paper-primary:   #0F1419  /* Fond principal - Deep Navy */
--paper-secondary: #1A1F26  /* Cartes et conteneurs */
--ink-primary:     #F5F1E8  /* Texte principal - Warm Cream */
--ink-secondary:   #EDE8DC  /* Texte secondaire */
--ink-muted:       #94A3B8  /* Texte discret */

/* Accent Colors */
--accent-vivid:    #E67E22  /* Orange - Actions principales */
--accent-hover:    #D35400  /* Orange hover */

/* Domain Colors (10 IABD domains) */
--domain-ml:   #3498DB  /* Machine Learning - Blue */
--domain-ai:   #9B59B6  /* IA Symbolique - Purple */
--domain-dw:   #1ABC9C  /* Data Warehousing - Teal */
--domain-bd:   #E74C3C  /* Big Data - Red */
--domain-sr:   #F39C12  /* Systèmes de Recommandation - Orange */
--domain-dm:   #2ECC71  /* Data Mining - Green */
--domain-dl:   #34495E  /* Deep Learning - Dark Blue */
--domain-vd:   #16A085  /* Visualisation - Sea Green */
--domain-ei:   #E91E63  /* Éthique - Pink */
--domain-nlp:  #00BCD4  /* NLP - Cyan */
```

#### Typographie

```css
/* Serif - Titres et contenus longs */
--font-serif: 'Crimson Pro', Georgia, serif;

/* Monospace - Métadonnées et éléments techniques */
--font-mono: 'JetBrains Mono', 'SF Mono', 'Courier New', monospace;
```

#### Composants UI

| Composant | Variantes | Usage |
|-----------|-----------|-------|
| **Button** | `primary`, `secondary` | Actions principales et secondaires |
| **Badge** | `default`, `accent`, `success`, `warning` | Labels et statuts |
| **Card** | Hoverable, Standard | Conteneurs de contenu |
| **ProgressBar** | Domain-colored | Progression et scores |

---

## 📚 Les domaines IABD

L'application couvre les 10 domaines du programme IABD :

1. **Machine Learning Fondamental** - Algorithmes d'apprentissage supervisé et non supervisé
2. **IA Symbolique** - Systèmes experts et logique formelle
3. **Data Warehousing** - Entrepôts de données et ETL
4. **Big Data** - Frameworks distribués et traitement massif
5. **Systèmes de Recommandation** - Filtering collaboratif et content-based
6. **Data Mining** - Exploration et analyse de données
7. **Deep Learning** - Réseaux de neurones et CNN/RNN
8. **Visualisation de Données** - Dashboards et storytelling
9. **Éthique de l'IA** - Biais, fairness et responsabilité
10. **Traitement du Langage Naturel (NLP)** - Tokenisation, embeddings, transformers

---

## 📁 Structure du projet

```
reviewv2/
├── public/
│   ├── manifest.json          # Configuration PWA
│   ├── sw.js                  # Service Worker
│   └── favicon/               # Icônes générées
├── src/
│   ├── app/                   # Pages Next.js (App Router)
│   │   ├── onboarding/        # Configuration initiale
│   │   ├── practice/          # Mode pratique
│   │   ├── exam/              # Création d'examen
│   │   ├── quiz/              # Interface de quiz
│   │   ├── favorites/         # Questions favorites
│   │   ├── offline/           # Exercices offline
│   │   ├── exams/             # Historique des examens
│   │   ├── settings/          # Paramètres
│   │   ├── layout.tsx         # Root layout
│   │   └── globals.css        # Styles globaux
│   ├── components/
│   │   ├── ui/                # Composants de base
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Badge.tsx
│   │   │   └── ProgressBar.tsx
│   │   ├── layout/            # Layout components
│   │   │   ├── Navigation.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Footer.tsx
│   │   ├── features/          # Composants métier
│   │   │   ├── DomainSelector.tsx
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── QuizTimer.tsx
│   │   │   └── StatsCard.tsx
│   │   └── AppProvider.tsx    # Context provider
│   ├── services/              # Services métier
│   │   ├── IndexedDBService.ts    # Stockage local
│   │   ├── StorageService.ts      # Paramètres utilisateur
│   │   ├── OpenRouterService.ts   # Génération IA
│   │   └── StatisticsService.ts   # Calcul des stats
│   ├── types/
│   │   └── index.ts           # Types TypeScript
│   ├── lib/
│   │   └── utils.ts           # Fonctions utilitaires
│   └── hooks/                 # Custom React hooks
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 🔧 Configuration

### Variables d'environnement

Créez un fichier `.env.local` à la racine :

```bash
# OpenRouter API (optionnel si saisie via onboarding)
OPENROUTER_API_KEY=your_api_key_here

# Modèle par défaut
OPENROUTER_DEFAULT_MODEL=openai/gpt-oss-120b:free
```

### Manifest PWA

Le fichier `public/manifest.json` configure l'expérience PWA :

```json
{
  "name": "Review IABD",
  "short_name": "Review IABD",
  "display": "standalone",
  "background_color": "#0F1419",
  "theme_color": "#0F1419",
  "orientation": "portrait"
}
```

---

## 📦 Déploiement

### Vercel (recommandé)

```bash
# Installer Vercel CLI
npm i -g vercel

# Déployer
vercel
```

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/votre-username/review-iabd)

### Configuration de production

1. **Build statique** : Les 12 pages sont pré-rendues
2. **Service Worker** : Activé uniquement en production
3. **Offline** : Cache des assets statiques et des ressources API
4. **Installable** : Prompt d'installation PWA sur mobile

---

## 🛠️ Stack technique

| Catégorie | Technologie | Version |
|-----------|-------------|---------|
| **Framework** | Next.js | 16.1.6 |
| **UI Library** | React | 19.x |
| **Langage** | TypeScript | 5.x |
| **Styling** | Tailwind CSS | 4.0 |
| **Stockage** | IndexedDB (via `idb`) | latest |
| **Icons** | Lucide React | latest |
| **PWA** | next-pwa | latest |
| **IA API** | OpenRouter | - |

### Dépendances clés

```json
{
  "dependencies": {
    "next": "^16.1.6",
    "react": "^19.x",
    "tailwindcss": "^4.0",
    "idb": "^8.0.0",
    "lucide-react": "^latest",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  }
}
```

---

## 📄 License

Ce projet est sous licence [MIT](LICENSE).

---

## 👨‍💻 Auteur

Développé avec ❤️ pour les étudiants du domaine IABD

---

<div align="center">

**[⬆ Retour en haut](#-table-des-matières)**

*Built with Next.js 16 • TypeScript • Tailwind CSS*

</div>
