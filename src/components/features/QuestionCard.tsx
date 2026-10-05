"use client";

import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { StreamLanguage } from "@codemirror/language";
import { r as rMode } from "@codemirror/legacy-modes/mode/r";
import { oneDark } from "@codemirror/theme-one-dark";
import { Question, QuestionType, CodeLanguage } from "@/types";
import { getDomainColor } from "@/lib/utils";
import { DomainBadge } from "./DomainSelector";
import { Button } from "@/components/ui/Button";
import { Star, Play, Loader2, Eye, CheckCircle2, XCircle, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { codeRunner, CodeRunResult, SqlRunResult } from "@/services/CodeRunnerService";

// ============================================
// QUESTION CARD COMPONENT
// Affiche une question de n'importe quel type :
// QCM simple / multi-réponses / Vrai-Faux /
// texte à trous / exercice de code / cas pratique.
// ============================================

export interface QuestionValue {
  selectedIds: string[];
  textAnswers: string[];
  codeAnswer?: string;
  rubricChecked?: boolean[][];
  codeResult?: (CodeRunResult & Partial<SqlRunResult>) | null;
  codeRunning?: boolean;
  corrigeRevealed?: boolean;
}

export const emptyQuestionValue = (): QuestionValue => ({
  selectedIds: [],
  textAnswers: [],
});

interface QuestionCardProps {
  question: Question;
  value: QuestionValue;
  onChange: (patch: Partial<QuestionValue>) => void;
  showResult?: boolean;
  score?: number; // 0..1 (calculé par le parent)
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  className?: string;
  questionNumber?: number;
}

function languageExtension(language: CodeLanguage) {
  switch (language) {
    case "python":
      return [python()];
    case "sql":
      return [sql()];
    case "r":
      return [StreamLanguage.define(rMode)];
  }
}

export function QuestionCard({
  question,
  value,
  onChange,
  showResult = false,
  score,
  isFavorite = false,
  onToggleFavorite,
  className,
  questionNumber,
}: QuestionCardProps) {
  const domainColor = getDomainColor(question.domain);
  const [sqlRunning, setSqlRunning] = useState(false);

  const toggleChoice = (answerId: string) => {
    if (showResult) return;
    if (question.type === QuestionType.MULTIPLE_CHOICE) {
      const current = value.selectedIds;
      onChange({
        selectedIds: current.includes(answerId)
          ? current.filter((id) => id !== answerId)
          : [...current, answerId],
      });
    } else {
      onChange({ selectedIds: [answerId] });
    }
  };

  const runCode = async () => {
    if (!question.code || value.codeRunning) return;
    onChange({ codeRunning: true });
    try {
      let result: (CodeRunResult & Partial<SqlRunResult>) | null = null;
      if (question.code.language === "sql") {
        setSqlRunning(true);
      }
      switch (question.code.language) {
        case "python":
          result = await codeRunner.runPython(value.codeAnswer || "", question.code);
          break;
        case "r":
          result = await codeRunner.runR(value.codeAnswer || "", question.code);
          break;
        case "sql":
          result = await codeRunner.runSql(value.codeAnswer || "", question.code);
          break;
      }
      onChange({ codeRunning: false, codeResult: result });
    } catch (err) {
      onChange({
        codeRunning: false,
        codeResult: { ok: false, error: String((err as Error)?.message || err) },
      });
    } finally {
      setSqlRunning(false);
    }
  };

  const visibleTests = question.code?.tests.filter((t) => !t.hidden) || [];
  const hiddenTests = question.code?.tests.filter((t) => t.hidden) || [];
  const passedCount = value.codeResult?.tests?.filter((t) => t.passed).length || 0;
  const totalTests = question.code?.tests.length || 0;

  // Texte à trous : remplace les ___ par des champs de saisie
  const renderFillBlanks = () => {
    const parts = question.question.split("___");
    return (
      <div className="font-serif text-lg mb-6 space-y-3">
        <div className="leading-relaxed">
          {parts.map((part, i) => (
            <span key={i}>
              {part}
              {i < parts.length - 1 && (
                <input
                  type="text"
                  value={value.textAnswers[i] || ""}
                  onChange={(e) => {
                    const next = [...value.textAnswers];
                    next[i] = e.target.value;
                    onChange({ textAnswers: next });
                  }}
                  disabled={showResult}
                  className="inline-block mx-1 w-40 px-2 py-0.5 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-accent focus:outline-none focus:border-accent disabled:opacity-70"
                  placeholder={`Trou ${i + 1}`}
                />
              )}
            </span>
          ))}
        </div>
        {!showResult && (
          <p className="font-mono text-xs text-ink-muted">
            Une seule orthographe exacte n&apos;est pas exigée : casse, accents et
            espaces sont tolérés. Valide pour voir la correction.
          </p>
        )}
      </div>
    );
  };

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
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <DomainBadge domain={question.domain} />
            <span className="font-mono text-xs text-ink-muted uppercase">
              {question.difficulty}
            </span>
            {question.type === QuestionType.MULTIPLE_CHOICE && (
              <span className="font-mono text-xs text-accent border border-accent/50 px-2 py-0.5 rounded">
                plusieurs réponses
              </span>
            )}
            {question.type === QuestionType.CODE && question.code && (
              <span className="font-mono text-xs text-domain-dl border border-domain-dl/50 px-2 py-0.5 rounded">
                {question.code.language === "python"
                  ? "Python"
                  : question.code.language === "r"
                    ? "R"
                    : "SQL"}
              </span>
            )}
            {question.type === QuestionType.CASE_STUDY && (
              <span className="font-mono text-xs text-domain-gp border border-domain-gp/50 px-2 py-0.5 rounded">
                cas pratique
              </span>
            )}
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
            <Star className={cn("w-5 h-5", isFavorite && "fill-current")} />
          </button>
        )}
      </div>

      {/* Contexte (mise en situation) */}
      {question.context && (
        <div className="mb-4 p-4 bg-paper-dark/40 rounded border-l-2 border-paper-dark">
          <p className="font-serif text-sm text-ink-secondary whitespace-pre-line">
            {question.context}
          </p>
        </div>
      )}

      {/* Énoncé */}
      {question.type === QuestionType.FILL_BLANK ? (
        renderFillBlanks()
      ) : (
        <h3 className="font-serif text-lg mb-6 whitespace-pre-line">{question.question}</h3>
      )}

      {/* Choix : simple / multi / V-F */}
      {(question.type === QuestionType.SINGLE_CHOICE ||
        question.type === QuestionType.MULTIPLE_CHOICE ||
        question.type === QuestionType.TRUE_FALSE) && (
        <div className="space-y-3">
          {question.type === QuestionType.TRUE_FALSE && (
            <p className="font-mono text-xs text-ink-muted uppercase">
              Vrai ou faux ?
            </p>
          )}
          {question.answers.map((answer, index) => {
            const isSelected = value.selectedIds.includes(answer.id);
            const isCorrect = answer.isCorrect;
            const showCorrect = showResult && isCorrect;
            const showIncorrect = showResult && isSelected && !isCorrect;

            return (
              <button
                key={answer.id}
                onClick={() => toggleChoice(answer.id)}
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
                    {question.type === QuestionType.TRUE_FALSE
                      ? ""
                      : String.fromCharCode(65 + index)}
                  </span>
                  <span className="flex-1 font-serif">{answer.text}</span>
                  {showResult && isCorrect && (
                    <span className="text-domain-dl font-mono text-xs">✓ CORRECT</span>
                  )}
                  {showResult && isSelected && !isCorrect && (
                    <span className="text-domain-ml font-mono text-xs">✗ FAUX CHOIX</span>
                  )}
                </div>
                {/* Note par option dans le corrigé */}
                {showResult && answer.note && (
                  <p className="mt-2 text-xs text-ink-muted font-serif italic border-t border-paper-dark pt-2">
                    {answer.note}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Exercice de code */}
      {question.type === QuestionType.CODE && question.code && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded border border-paper-dark">
            <CodeMirror
              value={value.codeAnswer || question.code.starter || ""}
              height="280px"
              theme={oneDark}
              extensions={languageExtension(question.code.language)}
              editable={!showResult}
              basicSetup={{ tabSize: 4 }}
              onChange={(v) => onChange({ codeAnswer: v })}
            />
          </div>

          {!showResult && (
            <Button
              variant="secondary"
              size="sm"
              onClick={runCode}
              disabled={value.codeRunning}
            >
              {value.codeRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {question.code.language === "python" ? "Chargement de Python..." : "Exécution..."}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Exécuter et vérifier
                </>
              )}
            </Button>
          )}

          {/* Résultat d'exécution */}
          {value.codeResult && (
            <div className="space-y-3">
              {value.codeResult.output && (
                <div className="p-3 bg-paper-dark/50 rounded font-mono text-xs text-ink-secondary whitespace-pre-wrap max-h-48 overflow-y-auto">
                  <p className="text-ink-muted uppercase text-[10px] mb-1">Sortie</p>
                  {value.codeResult.output}
                </div>
              )}
              {value.codeResult.error && (
                <div className="p-3 bg-domain-ml/10 border border-domain-ml/40 rounded font-mono text-xs text-domain-ml whitespace-pre-wrap">
                  {value.codeResult.error}
                </div>
              )}
              {value.codeResult.tests && value.codeResult.tests.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-mono text-xs text-ink-muted uppercase">
                    Tests : {passedCount}/{totalTests} passés
                  </p>
                  {value.codeResult.tests.map((test, i) => {
                    const isHidden = hiddenTests.some((ht) => ht.name === test.name);
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-2 font-mono text-xs"
                      >
                        {test.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-domain-dl shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-domain-ml shrink-0" />
                        )}
                        <span className={test.passed ? "text-ink-secondary" : "text-domain-ml"}>
                          {isHidden ? "Test caché" : test.name}
                          {!test.passed && test.error && !isHidden ? ` : ${test.error}` : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* SQL : aperçu du résultat */}
              {question.code.language === "sql" && value.codeResult.columns && (
                <div className="overflow-x-auto">
                  <p className="font-mono text-xs text-ink-muted uppercase mb-1 flex items-center gap-1">
                    <Table2 className="w-3 h-3" /> Ton résultat ({value.codeResult.rows?.length || 0} lignes)
                  </p>
                  <table className="font-mono text-xs border border-paper-dark">
                    <thead>
                      <tr className="bg-paper-dark/50">
                        {value.codeResult.columns.map((c) => (
                          <th key={c} className="px-2 py-1 border border-paper-dark text-left">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(value.codeResult.rows || []).slice(0, 20).map((row, i) => (
                        <tr key={i}>
                          {((row as unknown[]) || []).map((cell, j) => (
                            <td key={j} className="px-2 py-1 border border-paper-dark text-ink-secondary">
                              {String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {"match" in value.codeResult && (
                    <p
                      className={cn(
                        "mt-2 font-mono text-xs",
                        value.codeResult.match ? "text-domain-dl" : "text-domain-ml"
                      )}
                    >
                      {value.codeResult.match
                        ? "✓ Résultat identique à la solution attendue"
                        : "✗ Le résultat diffère de la solution attendue"}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Corrigé (après validation en pratique) */}
          {showResult && question.code.solution && (
            <details className="p-3 bg-paper-dark/50 rounded border-l-2 border-accent">
              <summary className="font-mono text-xs text-accent uppercase cursor-pointer">
                Voir la solution de référence
              </summary>
              <pre className="mt-3 font-mono text-xs text-ink-secondary whitespace-pre-wrap">
                {question.code.solution}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Cas pratique */}
      {question.type === QuestionType.CASE_STUDY && question.subQuestions && (
        <div className="space-y-6">
          {question.subQuestions.map((sub, i) => {
            const revealed = value.corrigeRevealed;
            return (
              <div key={sub.id} className="border border-paper-dark rounded p-4">
                <p className="font-serif font-semibold mb-3">
                  <span className="font-mono text-xs text-ink-muted mr-2">
                    {i + 1}.
                  </span>
                  {sub.question}
                </p>
                <textarea
                  value={value.textAnswers[i] || ""}
                  onChange={(e) => {
                    const next = [...value.textAnswers];
                    next[i] = e.target.value;
                    onChange({ textAnswers: next });
                  }}
                  disabled={showResult}
                  rows={4}
                  placeholder="Rédige ta réponse..."
                  className="w-full p-3 bg-paper-secondary border border-paper-dark rounded font-serif text-sm text-ink-primary focus:outline-none focus:border-accent disabled:opacity-70"
                />
                {revealed && (
                  <div className="mt-4 space-y-3">
                    <div className="p-3 bg-paper-dark/50 rounded border-l-2 border-domain-dl">
                      <p className="font-mono text-xs text-domain-dl uppercase mb-2">
                        Corrigé
                      </p>
                      <p className="font-serif text-sm text-ink-secondary whitespace-pre-line">
                        {sub.answer}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-xs text-ink-muted uppercase mb-2">
                        Auto-évaluation : coche ce que ta réponse couvrait
                      </p>
                      <div className="space-y-2">
                        {sub.rubric.map((point, j) => {
                          const checked = value.rubricChecked?.[i]?.[j] || false;
                          return (
                            <label
                              key={j}
                              className="flex items-start gap-2 text-sm text-ink-secondary cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={showResult}
                                onChange={(e) => {
                                  const next = (value.rubricChecked || []).map((r) => [...r]);
                                  while (next.length <= i) next.push([]);
                                  next[i][j] = e.target.checked;
                                  onChange({ rubricChecked: next });
                                }}
                                className="mt-1 accent-[var(--accent-vivid)]"
                              />
                              {point}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!showResult && !value.corrigeRevealed && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onChange({ corrigeRevealed: true })}
              disabled={value.textAnswers.filter(Boolean).length === 0}
            >
              <Eye className="w-4 h-4 mr-2" />
              Voir le corrigé et t&apos;auto-évaluer
            </Button>
          )}
          {typeof score === "number" && value.corrigeRevealed && (
            <p className="font-mono text-xs text-ink-muted">
              Score d&apos;auto-évaluation : {Math.round(score * 100)} %
              {score < 0.7 && " (en dessous de 70 %, ce cas part dans ton cahier d'erreurs)"}
            </p>
          )}
        </div>
      )}

      {/* Explication (corrigé) */}
      {showResult && question.explanation && question.type !== QuestionType.CASE_STUDY && (
        <div className="mt-6 p-4 bg-paper-dark/50 rounded border-l-2 border-accent">
          <p className="font-mono text-xs text-ink-muted uppercase mb-2">
            Explication
          </p>
          <p className="font-serif text-sm text-ink-secondary">{question.explanation}</p>
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
