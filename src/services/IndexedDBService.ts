import { openDB, DBSchema, IDBPDatabase } from "idb";
import {
  Question,
  QuizSession,
  SavedExam,
  SavedExercise,
  UserSettings,
  UserStatistics,
  UserAnswer,
} from "@/types";

// ============================================
// INDEXEDDB SERVICE
// Handles all local storage operations
// ============================================

interface ReviewIABDDB extends DBSchema {
  settings: {
    key: string;
    value: UserSettings;
  };
  sessions: {
    key: string;
    value: QuizSession;
    indexes: { "by-status": string };
  };
  exams: {
    key: string;
    value: SavedExam;
    indexes: {
      "by-type": string;
      "by-domain": string;
    };
  };
  exercises: {
    key: string;
    value: SavedExercise;
    indexes: {
      "by-domain": string;
      "unused": number;
    };
  };
  questions: {
    key: string;
    value: Question;
    indexes: {
      "by-domain": string;
      "favorite": number;
    };
  };
  favorites: {
    key: string;
    value: Question;
    indexes: { "by-domain": string };
  };
  statistics: {
    key: string;
    value: UserStatistics;
  };
}

const DB_NAME = "ReviewIABD";
const DB_VERSION = 1;

class IndexedDBService {
  private db: IDBPDatabase<ReviewIABDDB> | null = null;

  /**
   * Initialize database connection
   */
  async init(): Promise<void> {
    if (this.db) return;

    this.db = await openDB<ReviewIABDDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Settings store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }

        // Sessions store
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionStore = db.createObjectStore("sessions");
          sessionStore.createIndex("by-status", "status");
        }

        // Exams store
        if (!db.objectStoreNames.contains("exams")) {
          const examStore = db.createObjectStore("exams");
          examStore.createIndex("by-type", "type");
          examStore.createIndex("by-domain", "domain");
        }

        // Exercises store
        if (!db.objectStoreNames.contains("exercises")) {
          const exerciseStore = db.createObjectStore("exercises");
          exerciseStore.createIndex("by-domain", "domain");
          exerciseStore.createIndex("unused", "used");
        }

        // Questions store
        if (!db.objectStoreNames.contains("questions")) {
          const questionStore = db.createObjectStore("questions");
          questionStore.createIndex("by-domain", "domain");
        }

        // Favorites store
        if (!db.objectStoreNames.contains("favorites")) {
          const favoriteStore = db.createObjectStore("favorites");
          favoriteStore.createIndex("by-domain", "domain");
        }

        // Statistics store
        if (!db.objectStoreNames.contains("statistics")) {
          db.createObjectStore("statistics");
        }
      },
    });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDB(): Promise<IDBPDatabase<ReviewIABDDB>> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  // ============================================
  // SETTINGS OPERATIONS
  // ============================================

  async getSettings(): Promise<UserSettings | undefined> {
    const db = await this.ensureDB();
    return db.get("settings", "user");
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    const db = await this.ensureDB();
    await db.put("settings", settings, "user");
  }

  async updateSettings(
    updates: Partial<UserSettings>
  ): Promise<UserSettings | undefined> {
    const settings = await this.getSettings();
    if (!settings) return undefined;

    const updatedSettings = {
      ...settings,
      ...updates,
      updatedAt: new Date(),
    };

    await this.saveSettings(updatedSettings);
    return updatedSettings;
  }

  // ============================================
  // SESSION OPERATIONS
  // ============================================

  async saveSession(session: QuizSession): Promise<void> {
    const db = await this.ensureDB();
    await db.put("sessions", session, session.id); // Explicitly pass the key
  }

  async getSession(id: string): Promise<QuizSession | undefined> {
    const db = await this.ensureDB();
    return db.get("sessions", id);
  }

  async getAllSessions(): Promise<QuizSession[]> {
    const db = await this.ensureDB();
    return db.getAll("sessions");
  }

  async getSessionsByStatus(
    status: QuizSession["status"]
  ): Promise<QuizSession[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex("sessions", "by-status", status);
  }

  async deleteSession(id: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("sessions", id);
  }

  async clearSessions(): Promise<void> {
    const db = await this.ensureDB();
    await db.clear("sessions");
  }

  // ============================================
  // EXAM OPERATIONS
  // ============================================

  async saveExam(exam: SavedExam): Promise<void> {
    const db = await this.ensureDB();
    await db.put("exams", exam, exam.id); // Explicitly pass the key
  }

  async getExam(id: string): Promise<SavedExam | undefined> {
    const db = await this.ensureDB();
    return db.get("exams", id);
  }

  async getAllExams(): Promise<SavedExam[]> {
    const db = await this.ensureDB();
    return db.getAll("exams");
  }

  async getExamsByType(type: SavedExam["type"]): Promise<SavedExam[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex("exams", "by-type", type);
  }

  async deleteExam(id: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("exams", id);
  }

  // ============================================
  // EXERCISE OPERATIONS
  // ============================================

  async saveExercise(exercise: SavedExercise): Promise<void> {
    const db = await this.ensureDB();
    await db.put("exercises", exercise, exercise.id); // Explicitly pass the key
  }

  async getExercise(id: string): Promise<SavedExercise | undefined> {
    const db = await this.ensureDB();
    return db.get("exercises", id);
  }

  async getAllExercises(): Promise<SavedExercise[]> {
    const db = await this.ensureDB();
    return db.getAll("exercises");
  }

  async getUnusedExercises(): Promise<SavedExercise[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex("exercises", "unused", 0);
  }

  async getExercisesByDomain(domain: string): Promise<SavedExercise[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex("exercises", "by-domain", domain);
  }

  async markExerciseUsed(id: string): Promise<void> {
    const exercise = await this.getExercise(id);
    if (exercise) {
      exercise.used = true;
      exercise.lastUsedAt = new Date();
      await this.saveExercise(exercise);
    }
  }

  async deleteExercise(id: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("exercises", id);
  }

  // ============================================
  // QUESTION OPERATIONS
  // ============================================

  async saveQuestion(question: Question): Promise<void> {
    const db = await this.ensureDB();
    await db.put("questions", question, question.id); // Explicitly pass the key
  }

  async saveQuestions(questions: Question[]): Promise<void> {
    const db = await this.ensureDB();
    const tx = db.transaction("questions", "readwrite");
    await Promise.all([
      ...questions.map((q) => tx.store.put(q, q.id)), // Explicitly pass the key
      tx.done,
    ]);
  }

  async getQuestion(id: string): Promise<Question | undefined> {
    const db = await this.ensureDB();
    return db.get("questions", id);
  }

  async getQuestionsByDomain(domain: string): Promise<Question[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex("questions", "by-domain", domain);
  }

  async getAllQuestions(): Promise<Question[]> {
    const db = await this.ensureDB();
    return db.getAll("questions");
  }

  async deleteQuestion(id: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("questions", id);
  }

  // ============================================
  // FAVORITE OPERATIONS
  // ============================================

  async addFavorite(question: Question): Promise<void> {
    const db = await this.ensureDB();
    await db.put("favorites", question, question.id); // Explicitly pass the key
  }

  async removeFavorite(id: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete("favorites", id);
  }

  async isFavorite(id: string): Promise<boolean> {
    const db = await this.ensureDB();
    const favorite = await db.get("favorites", id);
    return favorite !== undefined;
  }

  async getAllFavorites(): Promise<Question[]> {
    const db = await this.ensureDB();
    return db.getAll("favorites");
  }

  async getFavoritesByDomain(domain: string): Promise<Question[]> {
    const db = await this.ensureDB();
    return db.getAllFromIndex("favorites", "by-domain", domain);
  }

  async clearFavorites(): Promise<void> {
    const db = await this.ensureDB();
    await db.clear("favorites");
  }

  // ============================================
  // STATISTICS OPERATIONS
  // ============================================

  async getStatistics(): Promise<UserStatistics | undefined> {
    const db = await this.ensureDB();
    return db.get("statistics", "user");
  }

  async saveStatistics(stats: UserStatistics): Promise<void> {
    const db = await this.ensureDB();
    await db.put("statistics", stats, "user");
  }

  async updateStatistics(
    updates: Partial<UserStatistics>
  ): Promise<UserStatistics | undefined> {
    const stats = await this.getStatistics();
    if (!stats) {
      // Initialize statistics if not exists
      const { Domain } = await import("@/types");
      const initialProgress: Record<string, { questionsAnswered: number; correctAnswers: number; averageScore: number }> = {};
      Object.values(Domain).forEach((d) => {
        initialProgress[d] = {
          questionsAnswered: 0,
          correctAnswers: 0,
          averageScore: 0,
        };
      });

      const newStats: UserStatistics = {
        totalQuestionsAnswered: 0,
        totalCorrectAnswers: 0,
        totalExamsTaken: 0,
        averageScore: 0,
        totalStudyTime: 0,
        favoriteQuestions: [],
        domainsProgress: initialProgress as any,
        ...updates,
      };
      await this.saveStatistics(newStats);
      return newStats;
    }

    const updatedStats = { ...stats, ...updates };
    await this.saveStatistics(updatedStats);
    return updatedStats;
  }

  // ============================================
  // UTILITY OPERATIONS
  // ============================================

  /**
   * Clear all data (useful for reset)
   */
  async clearAll(): Promise<void> {
    const db = await this.ensureDB();
    const stores = [
      "sessions",
      "exams",
      "exercises",
      "questions",
      "favorites",
    ] as const;
    const tx = db.transaction(stores, "readwrite");
    await Promise.all([...stores.map((s) => db.clear(s)), tx.done]);
  }

  /**
   * Export all data as JSON (for backup)
   */
  async exportData(): Promise<string> {
    const [settings, sessions, exams, exercises, favorites] =
      await Promise.all([
        this.getSettings(),
        this.getAllSessions(),
        this.getAllExams(),
        this.getAllExercises(),
        this.getAllFavorites(),
      ]);

    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      sessions,
      exams,
      exercises,
      favorites,
    });
  }

  /**
   * Import data from JSON (for restore)
   */
  async importData(jsonData: string): Promise<void> {
    const data = JSON.parse(jsonData);

    if (data.settings) await this.saveSettings(data.settings);
    if (data.sessions) {
      for (const session of data.sessions) {
        await this.saveSession(session);
      }
    }
    if (data.exams) {
      for (const exam of data.exams) {
        await this.saveExam(exam);
      }
    }
    if (data.exercises) {
      for (const exercise of data.exercises) {
        await this.saveExercise(exercise);
      }
    }
    if (data.favorites) {
      for (const favorite of data.favorites) {
        await this.addFavorite(favorite);
      }
    }
  }

  /**
   * Get database size estimate
   */
  async getDatabaseSize(): Promise<number> {
    const [sessions, exams, exercises, questions, favorites] =
      await Promise.all([
        this.getAllSessions(),
        this.getAllExams(),
        this.getAllExercises(),
        this.getAllQuestions(),
        this.getAllFavorites(),
      ]);

    const size =
      JSON.stringify(sessions).length +
      JSON.stringify(exams).length +
      JSON.stringify(exercises).length +
      JSON.stringify(questions).length +
      JSON.stringify(favorites).length;

    return size;
  }
}

// Singleton instance
export const indexedDBService = new IndexedDBService();
