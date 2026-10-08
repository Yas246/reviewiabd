"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from "react";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Domain, DOMAIN_LABELS, Question, QuestionType } from "@/types";
import { questionBank } from "@/services/QuestionBankService";
import { Check, ChevronLeft, RotateCcw } from "lucide-react";

// ============================================
// BANQUE : LECTURE DES QUESTIONS
// Mode apprentissage : toutes les questions
// d'un domaine, en corrigé complet (bonne
// réponse, notes par option, explication).
// Défilement continu, position sauvegardée
// par domaine (reprise où on l'a laissée).
// ============================================

const TYPE_LABELS: Record<string, string> = {
  SINGLE_CHOICE: "QCM",
  MULTIPLE_CHOICE: "Multi-réponses",
  TRUE_FALSE: "Vrai / Faux",
  FILL_BLANK: "Texte à trous",
  CODE: "Code",
  CASE_STUDY: "Cas pratique",
};

const posKey = (domain: string) => `lecture_pos_${domain}`;

export default function BanquePage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selected, setSelected] = useState<Domain | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [savedPos, setSavedPos] = useState<number | null>(null);
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [importedCounts, setImportedCounts] = useState<Map<Domain, number>>(new Map());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger toute la banque (préchargée + imports)
  useEffect(() => {
    const load = async () => {
      const bank = await questionBank.getAll();
      const byDomain = new Map<Domain, number>();
      const importedByDomain = new Map<Domain, number>();
      const pos: Record<string, number> = {};
      for (const q of bank) {
        byDomain.set(q.domain, (byDomain.get(q.domain) || 0) + 1);
        if (q.source && q.source !== "preloaded") {
          importedByDomain.set(q.domain, (importedByDomain.get(q.domain) || 0) + 1);
        }
        if (!(q.domain in pos)) {
          const saved = Number(localStorage.getItem(posKey(q.domain)) || "0");
          if (saved > 0) pos[q.domain] = saved;
        }
      }
      setDomains(Array.from(byDomain.keys()));
      setPositions(pos);
      setImportedCounts(importedByDomain);
      setLoading(false);
    };
    load();
  }, []);

  const openDomain = useCallback(async (domain: Domain, opts?: { fromHistory?: boolean }) => {
    const bank = await questionBank.getAll();
    const list = bank
      .filter((q) => q.domain === domain)
      .sort((a, b) => a.id.localeCompare(b.id, "fr", { numeric: true }));
    setQuestions(list);
    setSelected(domain);
    if (!opts?.fromHistory) {
      // Navigation enregistrée dans l'historique : Retour = liste des domaines
      window.history.pushState({ banque: domain }, "", `/banque?d=${domain}`);
    }
    const saved = Number(localStorage.getItem(posKey(domain)) || "0");
    setSavedPos(saved > 0 && saved < list.length ? saved : null);
    setCurrent(saved > 0 && saved < list.length ? saved : 0);
  }, []);

  // Après le chargement : réouvrir le domaine présent dans l'URL (?d=...)
  // en s'assurant que Back ramène à la liste (entrée liste + entrée domaine)
  useEffect(() => {
    if (loading || selected || domains.length === 0) return;
    const d = (new URLSearchParams(window.location.search).get("d") ||
      window.history.state?.banque) as Domain | null;
    if (d && domains.includes(d)) {
      window.history.replaceState({ banque: null }, "", "/banque");
      window.history.pushState({ banque: d }, "", `/banque?d=${d}`);
      openDomain(d, { fromHistory: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, domains]);

  // Retour du navigateur : liste des domaines, ou re-ouverture de la fiche
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const domain = e.state?.banque as Domain | null;
      if (domain && domains.includes(domain)) {
        openDomain(domain, { fromHistory: true });
      } else {
        setSelected(null);
        setQuestions([]);
        setSavedPos(null);
        window.history.replaceState({ banque: null }, "", "/banque");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domains]);

  // Reprise de position : après le rendu de la liste, scroll vers la question
  useEffect(() => {
    if (!selected || questions.length === 0) return;
    const t = window.setTimeout(() => {
      const target = current > 0 ? document.getElementById(`bq-${current}`) : null;
      if (target) {
        window.scrollTo({ top: target.offsetTop - 90, behavior: "auto" });
      } else {
        window.scrollTo({ top: 0 });
      }
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, questions]);

  // Suivi du défilement : quelle question est en haut de l'écran ?
  useEffect(() => {
    if (!selected) return;
    const onScroll = () => {
      const cards = document.querySelectorAll("[data-bq-index]");
      let visible = 0;
      cards.forEach((c) => {
        if (c.getBoundingClientRect().top < 140) {
          visible = Number(c.getAttribute("data-bq-index"));
        }
      });
      setCurrent(visible);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        localStorage.setItem(posKey(selected), String(visible));
        setPositions((prev) => ({ ...prev, [selected]: visible }));
      }, 400);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [selected, questions]);

  const restart = () => {
    if (!selected) return;
    localStorage.removeItem(posKey(selected));
    setPositions((prev) => {
      const next = { ...prev };
      delete next[selected];
      return next;
    });
    setSavedPos(null);
    setCurrent(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const backToList = () => {
    // Consomme l'entrée d'historique poussée à l'ouverture : le popstate
    // remet la liste (et l'URL reste /banque)
    window.history.back();
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-12">
        <PageHeader
          title="Lire les questions"
          description="Mode apprentissage : toutes les questions par domaine, avec les bonnes réponses et les explications. Pour apprendre avant de se tester."
        />

        {/* Liste des domaines */}
        {!selected && (
          <>
            {loading ? (
              <p className="font-mono text-sm text-ink-muted">Chargement de la banque...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {domains.map((d) => (
                  <Card key={d} hoverable className="cursor-pointer" onClick={() => openDomain(d)}>
                    <CardContent className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-mono font-semibold">{DOMAIN_LABELS[d]}</p>
                        <p className="text-xs text-ink-muted mt-1">
                          Lire les questions et leurs corrigés
                        </p>
                      </div>
                      <Badge variant="default">
                        {positions[d]
                          ? `reprise : q${positions[d] + 1}`
                          : "nouveau"}
                      </Badge>
                      {(importedCounts.get(d) || 0) > 0 && (
                        <Badge variant="warning">
                          {importedCounts.get(d)} importée{(importedCounts.get(d) || 0) > 1 ? "s" : ""}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Lecture d'un domaine */}
        {selected && (
          <>
            {/* Barre collante : position + reprise + recommencer */}
            <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-paper-primary/90 backdrop-blur border-b border-paper-dark flex items-center gap-3 flex-wrap">
              <Button variant="secondary" size="sm" className="min-w-0" onClick={backToList}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Domaines
              </Button>
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm font-semibold truncate">
                  {DOMAIN_LABELS[selected]}
                </p>
                <p className="font-mono text-[10px] text-ink-muted uppercase">
                  Question {current + 1} / {questions.length}
                </p>
              </div>
              {savedPos !== null && current !== savedPos && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-w-0"
                  onClick={() => {
                    const t = document.getElementById(`bq-${savedPos}`);
                    if (t) window.scrollTo({ top: t.offsetTop - 90, behavior: "smooth" });
                  }}
                >
                  Reprendre à q{savedPos + 1}
                </Button>
              )}
              <Button variant="secondary" size="sm" className="min-w-0" onClick={restart}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Début
              </Button>
            </div>

            {savedPos !== null && (
              <p className="text-xs text-ink-muted mt-3">
                Reprise de ta dernière lecture à la question {savedPos + 1}.
              </p>
            )}

            {/* Les questions : banque officielle puis section séparée des importées */}
            <div className="space-y-5 mt-4">
              {(() => {
                const importedStart = questions.findIndex(
                  (q) => q.source && q.source !== "preloaded"
                );
                return questions.map((q, i) => (
                  <Fragment key={q.id}>
                    {i === importedStart && importedStart >= 0 && (
                      <div className="border-2 border-dashed border-accent/40 rounded-xl p-4 bg-accent/5">
                        <p className="font-mono font-semibold text-sm text-accent">
                          Vos questions importées
                        </p>
                        <p className="text-xs text-ink-muted mt-1">
                          À partir d&apos;ici : les questions que TU as importées pour ce
                          domaine. Elles ne se mélangent pas avec la banque officielle
                          (1 400 questions).
                        </p>
                      </div>
                    )}
                    <QuestionLecture q={q} index={i} />
                  </Fragment>
                ));
              })()}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ============================================
// UNE QUESTION EN MODE CORRIGÉ COMPLET
// ============================================

function QuestionLecture({ q, index }: { q: Question; index: number }) {
  const isChoice =
    q.type === QuestionType.SINGLE_CHOICE ||
    q.type === QuestionType.MULTIPLE_CHOICE ||
    q.type === QuestionType.TRUE_FALSE;

  return (
    <Card id={`bq-${index}`} data-bq-index={index}>
      <CardContent>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="font-mono text-xs text-ink-muted">
            Q{index + 1}
          </span>
          {q.source && q.source !== "preloaded" && (
            <Badge variant="default">{q.source === "imported" ? "importée" : "IA"}</Badge>
          )}
          <Badge variant="default">{TYPE_LABELS[q.type] ?? q.type}</Badge>
          <span className="font-mono text-[10px] text-ink-muted uppercase">
            {q.difficulty === "easy" ? "facile" : q.difficulty === "medium" ? "moyen" : "difficile"}
          </span>
        </div>

        {/* Énoncé */}
        <p className="font-serif font-semibold">{q.question}</p>
        {q.context && (
          <p className="text-sm text-ink-muted mt-2 border-l-2 border-paper-dark pl-3">
            {q.context}
          </p>
        )}

        {/* Choix : bonne réponse marquée, note sous chaque option */}
        {isChoice && (
          <div className="mt-4 space-y-2">
            {q.answers.map((a) => {
              const correct = a.isCorrect;
              return (
                <div
                  key={a.id}
                  className={`p-3 rounded border ${
                    correct
                      ? "border-domain-dl/60 bg-domain-dl/5"
                      : "border-paper-dark"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {correct ? (
                      <Check className="w-4 h-4 text-domain-dl mt-0.5 shrink-0" />
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className={`text-sm ${correct ? "font-semibold" : "text-ink-secondary"}`}>
                        {a.text}
                      </p>
                      {a.note && (
                        <p className="text-xs text-ink-muted italic mt-1">{a.note}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Texte à trous : les réponses acceptées */}
        {q.type === QuestionType.FILL_BLANK && q.blanks && q.blanks.length > 0 && (
          <div className="mt-4 p-3 rounded bg-paper-dark/40">
            <p className="font-mono text-[10px] uppercase text-ink-muted mb-2">Réponses acceptées</p>
            <p className="text-sm">
              {q.blanks
                .map((b, i) => `Trou ${i + 1} : ${b.accepted.join(" ou ")}`)
                .join(" · ")}
            </p>
          </div>
        )}

        {/* Code : données + solution */}
        {q.type === QuestionType.CODE && q.code && (
          <div className="mt-4 space-y-2">
            {q.code.setup && (
              <div>
                <p className="font-mono text-[10px] uppercase text-ink-muted mb-1">
                  Données de l&apos;exercice ({q.code.language})
                </p>
                <pre className="code-block rounded-lg p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                  {q.code.setup}
                </pre>
              </div>
            )}
            <div>
              <p className="font-mono text-[10px] uppercase text-ink-muted mb-1">Solution</p>
              <pre className="code-block rounded-lg p-3 text-xs whitespace-pre-wrap overflow-x-auto">
                {q.code.solution}
              </pre>
            </div>
          </div>
        )}

        {/* Cas pratique : corrigé question par question */}
        {q.type === QuestionType.CASE_STUDY && q.subQuestions && (
          <div className="mt-4 space-y-3">
            {q.subQuestions.map((sub, j) => (
              <div key={sub.id} className="border border-paper-dark rounded p-3">
                <p className="text-sm font-semibold mb-2">
                  {j + 1}. {sub.question}
                </p>
                <p className="text-sm text-ink-secondary whitespace-pre-line">
                  {sub.answer}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Explication globale */}
        {q.explanation && (
          <div className="mt-4 border-l-2 border-accent/60 pl-3">
            <p className="font-mono text-[10px] uppercase text-ink-muted mb-1">Explication</p>
            <p className="text-sm text-ink-secondary">{q.explanation}</p>
          </div>
        )}

        {/* Tags */}
        {q.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {q.tags.map((t) => (
              <span key={t} className="font-mono text-[10px] text-ink-muted border border-paper-dark rounded px-1.5 py-0.5">
                {t}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
