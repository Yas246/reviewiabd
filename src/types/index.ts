// ============================================
// TYPES FOR REVIEW IABD APPLICATION
// ============================================

// IABD Domain Enum (10 domaines d'origine + 4 matières d'épreuves)
export enum Domain {
  MACHINE_LEARNING = "MACHINE_LEARNING",
  IA_SYMBOLIQUE = "IA_SYMBOLIQUE",
  DATA_WAREHOUSING = "DATA_WAREHOUSING",
  BIG_DATA = "BIG_DATA",
  SYSTEMES_RECOMMANDATION = "SYSTEMES_RECOMMANDATION",
  DATA_MINING = "DATA_MINING",
  DEEP_LEARNING = "DEEP_LEARNING",
  VISUALISATION_DONNEES = "VISUALISATION_DONNEES",
  ETHIQUE_IA = "ETHIQUE_IA",
  NLP = "NLP",
  ANALYSE_CONCEPTION = "ANALYSE_CONCEPTION",
  GESTION_PROJET = "GESTION_PROJET",
  BASES_DONNEES_SQL = "BASES_DONNEES_SQL",
  R_PYTHON_DATA = "R_PYTHON_DATA",
}

// Domain display names
export const DOMAIN_LABELS: Record<Domain, string> = {
  [Domain.MACHINE_LEARNING]: "Machine Learning Fondamental",
  [Domain.IA_SYMBOLIQUE]: "IA Symbolique",
  [Domain.DATA_WAREHOUSING]: "Data Warehousing",
  [Domain.BIG_DATA]: "Big Data",
  [Domain.SYSTEMES_RECOMMANDATION]: "Systèmes de Recommandation",
  [Domain.DATA_MINING]: "Data Mining",
  [Domain.DEEP_LEARNING]: "Deep Learning",
  [Domain.VISUALISATION_DONNEES]: "Visualisation de Données",
  [Domain.ETHIQUE_IA]: "Éthique de l'IA",
  [Domain.NLP]: "Traitement du Langage Naturel (NLP)",
  [Domain.ANALYSE_CONCEPTION]: "Analyse et Conception (UML, Merise)",
  [Domain.GESTION_PROJET]: "Gestion de Projet Informatique",
  [Domain.BASES_DONNEES_SQL]: "Bases de Données et SQL",
  [Domain.R_PYTHON_DATA]: "Python et R",
};

// Matières ajoutées pour couvrir les épreuves réelles (tronc commun, pratique pro)
export const NEW_EXAM_DOMAINS: Domain[] = [
  Domain.ANALYSE_CONCEPTION,
  Domain.GESTION_PROJET,
  Domain.BASES_DONNEES_SQL,
  Domain.R_PYTHON_DATA,
];

// Question type
export enum QuestionType {
  SINGLE_CHOICE = "SINGLE_CHOICE",
  MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
  TRUE_FALSE = "TRUE_FALSE",
  FILL_BLANK = "FILL_BLANK",
  CODE = "CODE",
  CASE_STUDY = "CASE_STUDY",
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.SINGLE_CHOICE]: "QCM (une réponse)",
  [QuestionType.MULTIPLE_CHOICE]: "QCM (plusieurs réponses)",
  [QuestionType.TRUE_FALSE]: "Vrai ou Faux",
  [QuestionType.FILL_BLANK]: "Texte à trous",
  [QuestionType.CODE]: "Exercice de code",
  [QuestionType.CASE_STUDY]: "Cas pratique",
};

// Types jouables en mode examen (correction objective automatique)
export const EXAM_SAFE_TYPES: QuestionType[] = [
  QuestionType.SINGLE_CHOICE,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.TRUE_FALSE,
  QuestionType.FILL_BLANK,
];

// Texte à trous : réponses acceptées par trou (dans l'ordre des ___)
export interface Blank {
  accepted: string[];
}

// Exercice de code : vérifié par exécution dans le navigateur
export type CodeLanguage = "python" | "r" | "sql";

export interface CodeTest {
  name: string;
  hidden: boolean; // test caché (anti-triche)
  code: string; // snippet Python (assert) / R (stopifnot) exécuté après le code utilisateur
}

export interface CodeSpec {
  language: CodeLanguage;
  setup?: string; // code exécuté avant le code utilisateur (données, schéma SQL...)
  starter?: string; // squelette fourni à l'étudiant
  solution: string; // solution de référence (pour le corrigé)
  tests: CodeTest[];
  timeLimitMs?: number; // garde-fou anti boucle infinie (défaut 10000)
  expectedRows?: unknown[][]; // SQL : résultat attendu (alternative aux tests)
}

// Cas pratique : sous-questions rédigées avec corrigé + grille d'auto-évaluation
export interface CaseSubQuestion {
  id: string;
  question: string;
  answer: string; // corrigé détaillé
  rubric: string[]; // points vérifiables ("as-tu mentionné X ?")
}

// Provenance d'une question
export type QuestionSource = "preloaded" | "imported" | "ai";

// Answer structure
export interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
  note?: string; // pourquoi cette option est vraie/fausse (explication par option)
}

// Question structure
export interface Question {
  id: string;
  domain: Domain;
  type: QuestionType;
  question: string;
  answers: Answer[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  source?: QuestionSource;
  context?: string; // énoncé long partagé (cas pratique, mise en situation)
  blanks?: Blank[]; // FILL_BLANK
  code?: CodeSpec; // CODE
  subQuestions?: CaseSubQuestion[]; // CASE_STUDY
  createdAt: Date;
}

// Quiz session state
export enum QuizSessionStatus {
  IDLE = "IDLE",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  PAUSED = "PAUSED",
  GENERATING = "GENERATING",
}

// User's answer for a question
export interface UserAnswer {
  questionId: string;
  selectedAnswerIds: string[];
  isCorrect: boolean;
  timeSpent: number; // in seconds
  isFavorite: boolean;
  textAnswers?: string[]; // FILL_BLANK / CASE_STUDY (une entrée par trou ou sous-question)
  codeAnswer?: string; // CODE
  codeScore?: number; // CODE : fraction de tests passés (0..1)
  selfScore?: number; // CASE_STUDY : score d'auto-évaluation (0..1)
  rubricChecked?: boolean[][]; // CASE_STUDY : points de grille cochés [sous-question][point]
}

// Quiz session
export interface QuizSession {
  id: string;
  type: "practice" | "exam" | "offline" | "favorites" | "mistakes" | "mock";
  domain?: Domain;
  questions: Question[];
  userAnswers: Record<string, UserAnswer>;
  currentIndex: number;
  status: QuizSessionStatus;
  startedAt: Date;
  completedAt?: Date;
  timeLimit?: number; // in seconds (for exam mode)
  timeRemaining?: number; // in seconds
  examId?: string; // Link to the SavedExam if this is an exam attempt
  exerciseId?: string; // Link to the SavedExercise if this is an offline exercise
  practiceQuizId?: string; // Link to the SavedPracticeQuiz if this is a practice quiz
  mockExamId?: string; // Link to a real past exam (épreuve réelle)
  label?: string; // Libellé affiché (cahier d'erreurs, épreuve réelle...)
  generationProgress?: {
    requestedCount: number;
    completedBatches: number;
    totalBatches: number;
    isGenerating: boolean;
    lastBatchAt?: Date;
    generationError?: string;
  };
}

// Generation state for quiz page consumption
export interface GenerationState {
  isGenerating: boolean;
  availableCount: number;
  requestedCount: number;
}

// Exam attempt with history
export interface ExamAttempt {
  id: string;
  type: "full" | "domain";
  domain?: Domain;
  questions: Question[];
  userAnswers: Record<string, UserAnswer>;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  startedAt: Date;
  completedAt: Date;
  timeSpent: number; // in seconds
}

// Saved exam with multiple attempts
export interface SavedExam {
  id: string;
  name: string;
  type: "full" | "domain";
  domain?: Domain;
  questions: Question[]; // Store the questions for reuse
  attempts: ExamAttempt[];
  bestScore: number;
  bestAttemptId: string;
  createdAt: Date;
  lastAttemptAt: Date;
  mockExamId?: string; // lien vers l'épreuve réelle si examen blanc dérivé
}

// Offline exercise
export interface SavedExercise {
  id: string;
  domain: Domain;
  questions: Question[];
  createdAt: Date;
  used: boolean;
  lastUsedAt?: Date;
}

// Saved practice quiz for reuse
export interface SavedPracticeQuiz {
  id: string;
  domain: Domain;
  questionCount: number;
  questions: Question[]; // Store questions for offline reuse
  bestScore?: number; // Optional: track best score
  attempts: number; // Number of times taken
  createdAt: Date;
  lastAttemptAt: Date;
  label?: string;
}

// ============================================
// CAHIER D'ERREURS + RÉPÉTITION ESPACÉE (SRS)
// ============================================

export interface MistakeHistoryEntry {
  date: Date;
  correct: boolean;
}

export interface MistakeEntry {
  id: string; // questionId
  question: Question; // snapshot complet
  missedCount: number;
  timesCorrect: number;
  correctStreak: number;
  mastered: boolean;
  firstMissedAt: Date;
  lastSeenAt: Date;
  srs: {
    intervalDays: number; // 1 -> 2 -> 4 -> 7 -> 14 -> 30
    dueAt: Date;
  };
  history: MistakeHistoryEntry[]; // plafonné aux 20 dernières réponses
}

// ============================================
// ACTIVITÉ QUOTIDIENNE + STREAK
// ============================================

export interface DailyStat {
  date: string; // "YYYY-MM-DD" (clé)
  answered: number;
  correct: number;
  timeSpent: number; // secondes
}

// AI Provider type
export type AIProvider = 'openrouter' | 'gemini';

// User settings
export interface UserSettings {
  apiKey: string;
  geminiApiKey?: string;  // Google API key for Gemini
  provider: AIProvider;   // AI provider selection
  model: string;
  defaultModel: string;
  customOpenRouterModel?: string;  // Custom model ID for OpenRouter
  customGeminiModel?: string;       // Custom model ID for Gemini
  notifyOnComplete: boolean;
  offlineQuestionsPerDomain: number;
  batchSize: number;  // Number of questions per API call (default: 10)
  onboardingCompleted: boolean;
  dailyGoal: number; // objectif quotidien de questions (défaut 20)
  examDate?: string; // date de l'examen (YYYY-MM-DD) pour le compte à rebours
  updatedAt: Date;
}

// Generation progress callback
export type GenerationProgressCallback = (progress: {
  current: number;
  total: number;
  batch: Question[];
}) => void;

// API error type
export interface APIError {
  message: string;
  code?: string;
  statusCode?: number;
  isRetryable: boolean;
}

// Statistics
export interface UserStatistics {
  totalQuestionsAnswered: number;
  totalCorrectAnswers: number;
  totalExamsTaken: number;
  averageScore: number;
  totalStudyTime: number; // in seconds
  favoriteQuestions: string[]; // question IDs
  domainsProgress: Record<Domain, {
    questionsAnswered: number;
    correctAnswers: number;
    averageScore: number;
  }>;
}

// Quiz result summary
export interface QuizResult {
  sessionId: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  timeSpent: number;
  domainBreakdown: Record<Domain, {
    total: number;
    correct: number;
  }>;
  difficultQuestions: string[]; // question IDs
  favoriteQuestions: string[]; // question IDs
}

// Generation request
export interface QuestionGenerationRequest {
  domain: Domain;
  count: number;
  difficulty?: "easy" | "medium" | "hard";
  includeExplanations: boolean;
  previousQuestions?: string[]; // Questions already generated (to avoid duplicates)
}

// Multi-domain generation request (for exams)
export interface MultiDomainQuestionRequest {
  domains: Domain[];
  countPerDomain: number;
  difficulty?: "easy" | "medium" | "hard";
  includeExplanations: boolean;
  previousQuestions?: string[]; // Questions already generated (to avoid duplicates)
}

// Domain with count
export interface DomainCount {
  domain: Domain;
  count: number;
}

// Generation response
export interface QuestionGenerationResponse {
  questions: Question[];
  totalGenerated: number;
  batchNumber: number;
  totalBatches: number;
}

// Background task for notifications
export interface BackgroundTask {
  id: string;
  type: 'quiz-generation' | 'exam-generation';
  status: 'pending' | 'generating' | 'ready' | 'failed';
  domain: string;
  questionCount: number;
  sessionId?: string;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

// AI Service interface (implemented by OpenRouterService and GeminiService)
export interface IAIService {
  generateQuestions(
    options: {
      domain: Domain;
      count: number;
      difficulty?: "easy" | "medium" | "hard";
      includeExplanations: boolean;
    },
    onProgress?: (progress: {
      current: number;
      total: number;
      batch: Question[];
    }) => void
  ): Promise<Question[]>;

  generateMultiDomainQuestions(
    request: MultiDomainQuestionRequest,
    onProgress?: (progress: {
      current: number;
      total: number;
      batch: Question[];
    }) => void
  ): Promise<Question[]>;

  validateApiKey(apiKey: string): Promise<boolean>;
}
