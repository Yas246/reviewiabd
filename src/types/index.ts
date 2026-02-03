// ============================================
// TYPES FOR REVIEW IABD APPLICATION
// ============================================

// IABD Domain Enum (10 domains)
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
};

// Question type (single choice for now, extensible)
export enum QuestionType {
  SINGLE_CHOICE = "SINGLE_CHOICE",
  MULTIPLE_CHOICE = "MULTIPLE_CHOICE",
}

// Answer structure
export interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
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
  createdAt: Date;
}

// Quiz session state
export enum QuizSessionStatus {
  IDLE = "IDLE",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  PAUSED = "PAUSED",
}

// User's answer for a question
export interface UserAnswer {
  questionId: string;
  selectedAnswerIds: string[];
  isCorrect: boolean;
  timeSpent: number; // in seconds
  isFavorite: boolean;
}

// Quiz session
export interface QuizSession {
  id: string;
  type: "practice" | "exam" | "offline" | "favorites";
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

// User settings
export interface UserSettings {
  apiKey: string;
  model: string;
  defaultModel: string;
  notifyOnComplete: boolean;
  offlineQuestionsPerDomain: number;
  onboardingCompleted: boolean;
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
