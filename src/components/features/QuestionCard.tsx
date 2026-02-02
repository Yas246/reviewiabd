"use client";

import { Question, Answer, Domain } from "@/types";
import { getDomainColor } from "@/lib/utils";
import { DomainBadge } from "./DomainSelector";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// QUESTION CARD COMPONENT
// Display a single question with answers
// ============================================

interface QuestionCardProps {
  question: Question;
  selectedAnswerId?: string;
  onAnswerSelect: (answerId: string) => void;
  showResult?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  className?: string;
  questionNumber?: number;
}

export function QuestionCard({
  question,
  selectedAnswerId,
  onAnswerSelect,
  showResult = false,
  isFavorite = false,
  onToggleFavorite,
  className,
  questionNumber,
}: QuestionCardProps) {
  const domainColor = getDomainColor(question.domain);

  return (
    <div className={cn("card", className)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {questionNumber && (
            <span className="font-mono text-xs text-ink-muted uppercase mb-2 block">
              Question {questionNumber}
            </span>
          )}
          <div className="flex items-center gap-2 mb-3">
            <DomainBadge domain={question.domain} />
            <span className="font-mono text-xs text-ink-muted uppercase">
              {question.difficulty}
            </span>
          </div>
        </div>
        {onToggleFavorite && (
          <button
            onClick={onToggleFavorite}
            className={cn(
              "p-2 rounded transition-colors",
              isFavorite ? "text-accent" : "text-ink-muted hover:text-accent"
            )}
            aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          >
            <Star
              className={cn("w-5 h-5", isFavorite && "fill-current")}
            />
          </button>
        )}
      </div>

      {/* Question */}
      <h3 className="font-serif text-lg mb-6">{question.question}</h3>

      {/* Answers */}
      <div className="space-y-3">
        {question.answers.map((answer, index) => {
          const isSelected = selectedAnswerId === answer.id;
          const isCorrect = answer.isCorrect;
          const showCorrect = showResult && isCorrect;
          const showIncorrect = showResult && isSelected && !isCorrect;

          return (
            <button
              key={answer.id}
              onClick={() => !showResult && onAnswerSelect(answer.id)}
              disabled={showResult}
              className={cn(
                "w-full text-left p-4 rounded border transition-all",
                "hover:border-accent/50",
                isSelected && !showResult && "border-accent bg-accent/10",
                showCorrect && "border-domain-dl bg-domain-dl/10",
                showIncorrect && "border-domain-ml bg-domain-ml/10",
                showResult && "cursor-not-allowed opacity-80"
              )}
              style={{
                borderColor:
                  isSelected && !showResult
                    ? domainColor
                    : showCorrect
                    ? "var(--domain-dl)"
                    : showIncorrect
                    ? "var(--domain-ml)"
                    : undefined,
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center font-mono text-xs font-bold",
                    isSelected && !showResult
                      ? "bg-accent text-paper-primary border-accent"
                      : "border-paper-dark text-ink-muted",
                    showCorrect && "bg-domain-dl text-paper-primary border-domain-dl",
                    showIncorrect && "bg-domain-ml text-paper-primary border-domain-ml"
                  )}
                >
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="flex-1 font-serif">{answer.text}</span>
                {showResult && isCorrect && (
                  <span className="text-domain-dl font-mono text-xs">✓ CORRECT</span>
                )}
                {showResult && isSelected && !isCorrect && (
                  <span className="text-domain-ml font-mono text-xs">✗ WRONG</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Explanation (shown in results) */}
      {showResult && question.explanation && (
        <div className="mt-6 p-4 bg-paper-dark/50 rounded border-l-2 border-accent">
          <p className="font-mono text-xs text-ink-muted uppercase mb-2">
            Explication
          </p>
          <p className="font-serif text-sm text-ink-secondary">
            {question.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

interface QuestionListProps {
  questions: Question[];
  renderQuestion: (question: Question, index: number) => React.ReactNode;
  className?: string;
}

export function QuestionList({
  questions,
  renderQuestion,
  className,
}: QuestionListProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {questions.map((question, index) => renderQuestion(question, index))}
    </div>
  );
}
