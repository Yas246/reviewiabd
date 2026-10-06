"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DomainSelector } from "@/components/features/DomainSelector";
import {
  Domain,
  DOMAIN_LABELS,
  Question,
  QUESTION_TYPE_LABELS,
  QuestionType,
  EXAM_SAFE_TYPES,
} from "@/types";
import { ClipboardCopy, Check, FileUp, AlertTriangle, Trash2, Save } from "lucide-react";
import { parseQuestionBatch } from "@/lib/questionValidation";
import { questionBank } from "@/services/QuestionBankService";
import { indexedDBService } from "@/services/IndexedDBService";
import { preloadedQuestionsService } from "@/services/PreloadedQuestionsService";
import { syncService } from "@/services/SyncService";
import { ProductTour, TourStep } from "@/components/ProductTour";

const IMPORT_TOUR_STEPS: TourStep[] = [
  {
    title: "Pas besoin de clé API ici",
    text: "Le principe : tu copies un prompt, tu le colles dans ton IA préférée (ChatGPT, Mistral, ton abonnement perso), puis tu ramènes le JSON ici. Les questions rejoignent ta banque locale, hors ligne.",
  },
  {
    target: "i-etape1",
    title: "Étape 1 : configure",
    text: "Matière, nombre de questions, difficulté, et surtout les formats : QCM, multi-réponses, Vrai/Faux, texte à trous, code vérifié par tests, cas pratiques.",
  },
  {
    target: "i-etape2",
    title: "Étape 2 : copie le prompt",
    text: "Le prompt est construit selon ta configuration. Copie-le et colle-le dans n'importe quelle IA à laquelle tu as accès.",
  },
  {
    target: "i-etape3",
    title: "Étape 3 : colle le résultat",
    text: "Rapporte le JSON renvoyé, clique Analyser : le validateur vérifie la structure, tu prévisualises chaque question, puis tu enregistres dans ta banque.",
  },
];

// ============================================
// IMPORT PAGE
// Génère un prompt copiable (avec format JSON
// strict et règles qualité) à coller dans n'importe
// quelle IA à abonnement (ChatGPT, Mistral, Claude...),
// puis importe et valide la réponse. Zéro clé API.
// ============================================

const TYPE_OPTIONS: { value: QuestionType; label: string; hint: string }[] = [
  { value: QuestionType.SINGLE_CHOICE, label: "QCM", hint: "une seule bonne réponse" },
  { value: QuestionType.MULTIPLE_CHOICE, label: "Multi-réponses", hint: "2 à 3 bonnes réponses (style tronc commun)" },
  { value: QuestionType.TRUE_FALSE, label: "Vrai / Faux", hint: "avec justification" },
  { value: QuestionType.FILL_BLANK, label: "Texte à trous", hint: "mots manquants ( ___ )" },
  { value: QuestionType.CODE, label: "Code", hint: "Python, R ou SQL vérifié par tests" },
  { value: QuestionType.CASE_STUDY, label: "Cas pratique", hint: "sous-questions rédigées + corrigé" },
];

export default function ImportPage() {
  const router = useRouter();
  const [selectedDomain, setSelectedDomain] = useState<Domain>(Domain.MACHINE_LEARNING);
  const [count, setCount] = useState(20);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [selectedTypes, setSelectedTypes] = useState<Set<QuestionType>>(
    new Set([QuestionType.SINGLE_CHOICE, QuestionType.MULTIPLE_CHOICE, QuestionType.TRUE_FALSE, QuestionType.FILL_BLANK])
  );
  const [topic, setTopic] = useState("");
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [importResult, setImportResult] = useState<{ questions: Question[]; failures: { index: number; errors: string[] }[]; error?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const prompt = useMemo(() => buildPrompt({ selectedDomain, count, difficulty, selectedTypes, topic }), [selectedDomain, count, difficulty, selectedTypes, topic]);

  const toggleType = (t: QuestionType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("Copie impossible : sélectionne le texte et copie-le manuellement.");
    }
  };

  const handleAnalyze = () => {
    setSaved(false);
    try {
      const { questions, failures } = parseQuestionBatch(pasted, selectedDomain);
      setImportResult({ questions, failures });
    } catch (e: any) {
      setImportResult({ questions: [], failures: [], error: e.message });
    }
  };

  const handleSave = async () => {
    if (!importResult || importResult.questions.length === 0) return;
    setSaving(true);
    try {
      await indexedDBService.init();
      await indexedDBService.saveQuestions(importResult.questions);
      questionBank.invalidate();
      // Synchronisation multi-appareils silencieuse (si un compte est branché)
      syncService.notifyProgressChanged();
      setSaved(true);
      setPasted("");
      setImportResult(null);
    } catch (e: any) {
      alert(`Erreur d'enregistrement : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-12">
        <PageHeader
          title="Importer des questions"
          description="Génère des questions avec ton abonnement IA préféré, sans clé API, et ajoute-les à ta banque locale"
          actions={
            <Button variant="secondary" size="sm" onClick={() => router.back()}>
              Retour
            </Button>
          }
        />

        {/* Étape 1 : configurer le prompt */}
        <Card data-tour="i-etape1" className="mb-8">
          <CardContent>
            <h3 className="font-mono font-semibold mb-4">Étape 1 : Configure tes questions</h3>
            <div className="space-y-6">
              <div>
                <p className="font-mono text-xs text-ink-muted uppercase mb-3">Matière</p>
                <DomainSelector value={selectedDomain} onChange={setSelectedDomain} />
              </div>

              <div>
                <p className="font-mono text-xs text-ink-muted uppercase mb-3">Nombre de questions</p>
                <div className="flex gap-2">
                  {[10, 20, 30, 50].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCount(n)}
                      className={`px-4 py-2 rounded border font-mono text-sm transition-colors ${
                        count === n
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-paper-dark text-ink-secondary hover:border-accent"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-mono text-xs text-ink-muted uppercase mb-3">Difficulté</p>
                <div className="flex flex-wrap gap-2">
                  {(["easy", "medium", "hard"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`px-4 py-2 rounded border font-mono text-sm transition-colors ${
                        difficulty === d
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-paper-dark text-ink-secondary hover:border-accent"
                      }`}
                    >
                      {d === "easy" ? "Facile" : d === "medium" ? "Moyen" : "Difficile"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-mono text-xs text-ink-muted uppercase mb-3">Formats</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {TYPE_OPTIONS.map((t) => (
                    <label
                      key={t.value}
                      className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                        selectedTypes.has(t.value)
                          ? "border-accent bg-accent/10"
                          : "border-paper-dark hover:border-accent/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTypes.has(t.value)}
                        onChange={() => toggleType(t.value)}
                        className="mt-1 accent-[var(--accent-vivid)]"
                      />
                      <span>
                        <span className="font-mono text-sm">{t.label}</span>
                        <span className="block text-xs text-ink-muted">{t.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-mono text-xs text-ink-muted uppercase mb-3">
                  Thème précis (optionnel)
                </p>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="ex. les métriques precision/rappel, les jointures SQL, Scrum..."
                  className="w-full px-4 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary focus:outline-none focus:border-accent"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Étape 2 : copier le prompt */}
        <Card data-tour="i-etape2" className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <h3 className="font-mono font-semibold">Étape 2 : Copie ce prompt</h3>
              <Button variant={copied ? "secondary" : "primary"} size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 mr-2" /> : <ClipboardCopy className="w-4 h-4 mr-2" />}
                {copied ? "Copié !" : "Copier le prompt"}
              </Button>
            </div>
            <p className="text-sm text-ink-muted mb-3">
              Colle-le dans ChatGPT, Mistral, Claude ou tout autre IA à laquelle tu as accès.
              Récupère ensuite le JSON renvoyé à l&apos;étape 3.
            </p>
            <pre className="p-4 bg-paper-dark/60 rounded font-mono text-xs text-ink-secondary whitespace-pre-wrap max-h-72 overflow-y-auto">
              {prompt}
            </pre>
          </CardContent>
        </Card>

        {/* Étape 3 : coller le résultat */}
        <Card data-tour="i-etape3" className="mb-8">
          <CardContent>
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <h3 className="font-mono font-semibold">Étape 3 : Colle la réponse JSON</h3>
              <Button variant="secondary" size="sm" onClick={handleAnalyze} disabled={!pasted.trim()}>
                <FileUp className="w-4 h-4 mr-2" />
                Analyser
              </Button>
            </div>
            <textarea
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value);
                setImportResult(null);
              }}
              rows={10}
              placeholder='Colle ici le tableau JSON renvoyé par l&apos;IA ( ex. [ { "question": ..., "answers": [...] }, ... ] )'
              className="w-full p-4 bg-paper-secondary border border-paper-dark rounded font-mono text-xs text-ink-primary focus:outline-none focus:border-accent"
            />

            {/* Rapport d'analyse */}
            {importResult?.error && (
              <div className="mt-4 p-3 bg-domain-ml/10 border border-domain-ml/40 rounded font-mono text-xs text-domain-ml">
                {importResult.error}
              </div>
            )}

            {importResult && !importResult.error && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="success">{importResult.questions.length} valides</Badge>
                  {importResult.failures.length > 0 && (
                    <Badge variant="warning">{importResult.failures.length} rejetées</Badge>
                  )}
                </div>

                {importResult.failures.length > 0 && (
                  <div className="p-3 bg-paper-dark/50 rounded border border-paper-dark">
                    <p className="font-mono text-xs text-ink-muted uppercase mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Questions rejetées
                    </p>
                    <ul className="text-xs text-ink-muted space-y-1">
                      {importResult.failures.slice(0, 8).map((f, i) => (
                        <li key={i}>
                          #{f.index + 1} : {f.errors.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Aperçu */}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {importResult.questions.map((q, i) => (
                    <div key={q.id} className="p-3 bg-paper-secondary rounded border border-paper-dark">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="default">{QUESTION_TYPE_LABELS[q.type]}</Badge>
                        <span className="font-mono text-xs text-ink-muted">{q.difficulty}</span>
                      </div>
                      <p className="font-serif text-sm">
                        {i + 1}. {q.question}
                      </p>
                      <p className="text-xs text-domain-dl mt-1">
                        ✓ {q.answers.filter((a) => a.isCorrect).map((a) => a.text).join("  •  ")}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setImportResult(null);
                      setPasted("");
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Jeter
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSave}
                    loading={saving}
                    disabled={importResult.questions.length === 0 || saved}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saved ? "Ajouté à la banque !" : `Ajouter ${importResult.questions.length} questions à ma banque`}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Note rechargement banque préchargée */}
        <Card className="border-l-4 border-l-accent">
          <CardContent>
            <p className="text-sm text-ink-muted">
              Les questions importées rejoignent ta banque locale et sont immédiatement
              disponibles en Pratique et en Examen blanc, même hors ligne. Pour reconstruire la
              banque préchargée d&apos;origine après une mise à jour de l&apos;application :
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={async () => {
                if (!confirm("Recharger toutes les questions préchargées (tes imports sont conservés) ?")) return;
                await indexedDBService.init();
                await preloadedQuestionsService.forceReload();
                questionBank.invalidate();
                alert("Banque préchargée rechargée.");
              }}
            >
              Recharger la banque préchargée
            </Button>
          </CardContent>
        </Card>
      </main>
      <ProductTour id="import" steps={IMPORT_TOUR_STEPS} />
    </div>
  );
}

// ============================================
// GÉNÉRATEUR DE PROMPT
// Les règles qualité imposées : position aléatoire
// de la bonne réponse, homogénéité de longueur des
// options, explication de CHAQUE option, JSON strict.
// ============================================

function buildPrompt({
  selectedDomain,
  count,
  difficulty,
  selectedTypes,
  topic,
}: {
  selectedDomain: Domain;
  count: number;
  difficulty: "easy" | "medium" | "hard";
  selectedTypes: Set<QuestionType>;
  topic: string;
}): string {
  const domainLabel = DOMAIN_LABELS[selectedDomain];
  const types = Array.from(selectedTypes);
  const typesDesc =
    types.length === 0
      ? "QCM à une seule bonne réponse"
      : types
          .map((t) => {
            if (t === QuestionType.SINGLE_CHOICE)
              return 'SINGLE_CHOICE : une seule bonne réponse parmi 4 options "answers"';
            if (t === QuestionType.MULTIPLE_CHOICE)
              return 'MULTIPLE_CHOICE : 4 options avec exactement 2 ou 3 "isCorrect": true';
            if (t === QuestionType.TRUE_FALSE)
              return 'TRUE_FALSE : "answers" = [{"id":"true","text":"Vrai",...},{"id":"false","text":"Faux",...}]';
            if (t === QuestionType.FILL_BLANK)
              return 'FILL_BLANK : énoncé contenant ___ pour chaque trou, champ "blanks":[{"accepted":["réponse","variante"]}]';
            if (t === QuestionType.CODE)
              return 'CODE : champ "code":{"language":"python"|"r"|"sql", "setup":"données", "starter":"squelette", "solution":"solution complète", "tests":[{"name":"...","hidden":false,"code":"assert ... (python) ou stopifnot(... (R))"}]}';
            return 'CASE_STUDY : champ "subQuestions":[{"id":"sq-1","question":"...","answer":"corrigé détaillé","rubric":["point à vérifier 1","point 2"]}]';
          })
          .join("\n  - ");

  return `Tu es un professeur d'Intelligence Artificielle et Big Data qui prépare des étudiants aux examens nationaux de la filière IABD (Bénin). Génère ${count} questions d'examen de difficulté "${difficulty === "easy" ? "facile" : difficulty === "medium" ? "moyenne" : "difficile"}" sur la matière : ${domainLabel}.${topic ? `\nThème à privilégier : ${topic}.` : ""}

FORMATS à utiliser (répartis dans le lot) :
  - ${typesDesc}

RÈGLES DE QUALITÉ STRICTES (obligatoires) :
1. POSITION ALÉATOIRE : la (les) bonne(s) réponse(s) doit(sent) être placée(s) à des positions différentes d'une question à l'autre (A, B, C, D équirépartis sur l'ensemble du lot). N'hésite pas à mettre la bonne réponse en première ou en dernière position.
2. LONGUEURS HOMOGÈNES : les mauvaises réponses (distracteurs) doivent avoir la même longueur, le même niveau de détail et le même style que la bonne réponse. Ne rends JAMAIS la bonne réponse reconnaissable parce qu'elle est plus précise ou plus longue que les autres.
3. DISTRACTEURS PLAUSIBLES : chaque mauvaise réponse doit être une confusion fréquente et réaliste (pas une absurdité).
4. EXPLICATION PAR OPTION : chaque option a un champ "note" : pour une mauvaise réponse, explique en une phrase la confusion qu'elle représente ; pour la bonne, confirme pourquoi elle est juste.
5. Champ "explanation" : explication synthétique (2-3 phrases) de la bonne réponse, sans jamais mentionner de lettres d'options.
6. Français impeccable, accentué, vocabulaire du programme. Une seule question parle d'un seul concept.
7. Réponds UNIQUEMENT avec un tableau JSON valide, sans texte avant ni après, sans markdown.

SCHÉMA JSON pour chaque question :
{
  "id": "q1",
  "domain": "${selectedDomain}",
  "type": "SINGLE_CHOICE | MULTIPLE_CHOICE | TRUE_FALSE | FILL_BLANK | CODE | CASE_STUDY",
  "question": "énoncé (avec ___ pour FILL_BLANK)",
  "context": "énoncé long optionnel (mise en situation)",
  "answers": [{"id": "a", "text": "...", "isCorrect": false, "note": "pourquoi cette option est fausse"}],
  "blanks": [{"accepted": ["réponse", "variante"]}],
  "code": {"language": "python", "setup": "...", "starter": "...", "solution": "...", "tests": [{"name": "Test 1", "hidden": false, "code": "assert ..."}]},
  "subQuestions": [{"id": "sq-1", "question": "...", "answer": "corrigé détaillé", "rubric": ["point 1", "point 2"]}],
  "explanation": "explication de la bonne réponse",
  "difficulty": "${difficulty}",
  "tags": ["tag1", "tag2"]
}
Omets les champs qui ne concernent pas le type choisi (pas de "blanks" pour un QCM, pas de "answers" pour un CASE_STUDY, etc.).

Commence directement par [ et termine par ].`;
}
