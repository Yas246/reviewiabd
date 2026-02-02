import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Domain, DOMAIN_LABELS } from "@/types";

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Merge class names with Tailwind CSS classes
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format time in seconds to readable format (MM:SS or HH:MM:SS)
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Format date to readable string
 */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Format date to short string (DD/MM/YYYY)
 */
export function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Calculate score from answers
 */
export function calculateScore(
  correctAnswers: number,
  totalQuestions: number
): number {
  if (totalQuestions === 0) return 0;
  return Math.round((correctAnswers / totalQuestions) * 100);
}

/**
 * Get domain color CSS variable
 */
export function getDomainColor(domain: Domain): string {
  const colors: Record<Domain, string> = {
    [Domain.MACHINE_LEARNING]: "var(--domain-ml)",
    [Domain.IA_SYMBOLIQUE]: "var(--domain-ai)",
    [Domain.DATA_WAREHOUSING]: "var(--domain-dw)",
    [Domain.BIG_DATA]: "var(--domain-bigdata)",
    [Domain.SYSTEMES_RECOMMANDATION]: "var(--domain-rec)",
    [Domain.DATA_MINING]: "var(--domain-mining)",
    [Domain.DEEP_LEARNING]: "var(--domain-dl)",
    [Domain.VISUALISATION_DONNEES]: "var(--domain-viz)",
    [Domain.ETHIQUE_IA]: "var(--domain-ethics)",
    [Domain.NLP]: "var(--domain-nlp)",
  };
  return colors[domain] || "var(--accent-vivid)";
}

/**
 * Get domain label
 */
export function getDomainLabel(domain: Domain): string {
  return DOMAIN_LABELS[domain] || domain;
}

/**
 * Get domain short label (first 2-3 letters)
 */
export function getDomainShortLabel(domain: Domain): string {
  const labels: Record<Domain, string> = {
    [Domain.MACHINE_LEARNING]: "ML",
    [Domain.IA_SYMBOLIQUE]: "IA",
    [Domain.DATA_WAREHOUSING]: "DW",
    [Domain.BIG_DATA]: "BD",
    [Domain.SYSTEMES_RECOMMANDATION]: "REC",
    [Domain.DATA_MINING]: "MIN",
    [Domain.DEEP_LEARNING]: "DL",
    [Domain.VISUALISATION_DONNEES]: "VIZ",
    [Domain.ETHIQUE_IA]: "ETH",
    [Domain.NLP]: "NLP",
  };
  return labels[domain] || domain.substring(0, 3);
}

/**
 * Get all domains as array
 */
export function getAllDomains(): Domain[] {
  return Object.values(Domain);
}

/**
 * Shuffle array using Fisher-Yates algorithm
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Sleep/delay function
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i);
      await sleep(delay);
    }
  }
  throw new Error("Max retries reached");
}

/**
 * Clamp number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Batch array into chunks
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * Calculate number of batches needed
 */
export function calculateBatches(total: number, batchSize: number): number {
  return Math.ceil(total / batchSize);
}

/**
 * Validate API key format (basic check)
 */
export function isValidApiKey(key: string): boolean {
  return key.length >= 20 && /^[a-zA-Z0-9_-]+$/.test(key);
}

/**
 * Sanitize string for display
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * Check if code is running in browser
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Check if device is mobile
 */
export function isMobile(): boolean {
  if (!isBrowser()) return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!isBrowser()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
