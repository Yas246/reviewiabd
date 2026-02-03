import { BackgroundTask, Domain } from "@/types";
import { indexedDBService } from "@/services/IndexedDBService";
import { DOMAIN_LABELS } from "@/types";

// ============================================
// NOTIFICATION SERVICE
// Handles background notifications for quiz generation
// ============================================

class NotificationService {
  private permission: NotificationPermission = "default";

  /**
   * Initialize notification service
   */
  async init(): Promise<void> {
    if ("Notification" in window) {
      this.permission = Notification.permission;
      console.log("[NotificationService] Permission status:", this.permission);
    } else {
      console.warn("[NotificationService] Notifications not supported");
    }
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("[NotificationService] Notifications not supported");
      return false;
    }

    if (this.permission === "granted") {
      return true;
    }

    if (this.permission === "denied") {
      console.warn("[NotificationService] Notifications denied by user");
      return false;
    }

    const result = await Notification.requestPermission();
    this.permission = result;

    console.log("[NotificationService] Permission request result:", result);
    return result === "granted";
  }

  /**
   * Check if notifications are enabled
   */
  isEnabled(): boolean {
    return this.permission === "granted";
  }

  /**
   * Create a background task for quiz generation
   */
  async createBackgroundTask(
    type: "quiz-generation" | "exam-generation",
    domain: string, // Can be a Domain or "FULL_EXAM"
    questionCount: number
  ): Promise<string> {
    const taskId = `bg-task-${Date.now()}`;

    const task: BackgroundTask = {
      id: taskId,
      type,
      status: "pending",
      domain,
      questionCount,
      createdAt: new Date(),
    };

    await indexedDBService.saveBackgroundTask(task);
    console.log("[NotificationService] Created background task:", taskId);
    return taskId;
  }

  /**
   * Update background task status
   */
  async updateTaskStatus(
    taskId: string,
    status: "generating" | "ready" | "failed",
    sessionId?: string,
    errorMessage?: string
  ): Promise<void> {
    const task = await indexedDBService.getBackgroundTask(taskId);
    if (!task) {
      console.warn("[NotificationService] Task not found:", taskId);
      return;
    }

    const updatedTask: BackgroundTask = {
      ...task,
      status,
      sessionId,
      errorMessage,
      completedAt: status === "ready" || status === "failed" ? new Date() : undefined,
    };

    await indexedDBService.saveBackgroundTask(updatedTask);

    // If task is ready, send notification
    if (status === "ready" && sessionId) {
      await this.sendQuizReadyNotification(updatedTask);
    }
  }

  /**
   * Send notification when quiz is ready
   */
  private async sendQuizReadyNotification(task: BackgroundTask): Promise<void> {
    if (!this.isEnabled()) {
      console.log("[NotificationService] Notifications not enabled, skipping");
      return;
    }

    const domainLabel = DOMAIN_LABELS[task.domain as Domain] || task.domain;
    const title = "Quiz prêt !";
    const body = `Vos ${task.questionCount} questions sur ${domainLabel} sont prêtes à être utilisées.`;

    // Send message to service worker to show notification
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "SHOW_NOTIFICATION",
        payload: {
          title,
          body,
          url: `/quiz?session=${task.sessionId}`,
          tag: "quiz-ready",
          data: { sessionId: task.sessionId },
        },
      });

      console.log("[NotificationService] Sent notification to service worker");
    } else {
      // Fallback: show regular notification
      new Notification(title, {
        body,
        icon: "/icon-192.png",
        tag: "quiz-ready",
        data: { sessionId: task.sessionId },
      });

      console.log("[NotificationService] Sent fallback notification");
    }
  }

  /**
   * Check for completed background tasks and show notifications
   * Call this when the app regains focus
   */
  async checkCompletedTasks(): Promise<BackgroundTask[]> {
    const tasks = await indexedDBService.getAllBackgroundTasks();
    const completedTasks = tasks.filter(t => t.status === "ready" && !t.sessionId);

    if (completedTasks.length > 0) {
      console.log(`[NotificationService] Found ${completedTasks.length} completed tasks`);
    }

    return completedTasks;
  }

  /**
   * Clear old completed tasks
   */
  async clearOldTasks(): Promise<void> {
    await indexedDBService.clearCompletedBackgroundTasks();
  }
}

// Singleton instance
export const notificationService = new NotificationService();
