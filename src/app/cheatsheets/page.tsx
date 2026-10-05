"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation } from "@/components/layout/Navigation";
import { PageHeader } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  BookOpen,
  ChevronLeft,
  Search,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================
// CHEAT SHEETS PAGE
// Fiches de référence par matière : ça sert à
// quoi / comment on l'écrit / les pièges.
// Recherche dans la fiche et transversale.
// ============================================

interface CheatItem {
  what: string;
  code?: string;
  note?: string;
}

interface CheatSection {
  title: string;
  items: CheatItem[];
}

interface CheatSheet {
  id: string;
  title: string;
  description: string;
  sections: CheatSection[];
}

const SHEET_FILES = [
  "PYTHON",
  "PANDAS",
  "NUMPY",
  "SCIPY",
  "R",
  "SQL",
  "MACHINE_LEARNING",
  "DEEP_LEARNING",
  "ANALYSE_CONCEPTION",
  "GESTION_PROJET",
  "BIG_DATA",
];

// ============================================
// COLORATION SYNTAXIQUE MAISON
// Mots-clés, chaînes, commentaires, nombres :
// sans dépendance externe, léger et rapide.
// ============================================

const KEYWORDS: Record<string, string[]> = {
  python: ["def", "return", "if", "elif", "else", "for", "while", "import", "from", "as", "with", "in", "not", "and", "or", "lambda", "class", "try", "except", "finally", "raise", "True", "False", "None", "assert", "pass", "global", "del"],
  r: ["function", "return", "if", "else", "for", "while", "repeat", "break", "next", "in", "library", "TRUE", "FALSE", "NA", "NULL", "Inf", "stopifnot", "data.frame", "matrix"],
  sql: ["SELECT", "FROM", "WHERE", "GROUP", "BY", "HAVING", "ORDER", "LIMIT", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "ALTER", "DROP", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "ON", "AS", "AND", "OR", "NOT", "NULL", "IS", "IN", "LIKE", "BETWEEN", "DISTINCT", "COUNT", "SUM", "AVG", "MIN", "MAX", "CASE", "WHEN", "THEN", "END", "UNION", "ALL", "EXISTS", "BEGIN", "COMMIT", "ROLLBACK", "PRIMARY", "KEY", "REFERENCES", "INDEX", "VIEW", "EXPLAIN", "DESC", "ASC"],
  concepts: ["accuracy", "précision", "rappel", "overfitting", "underfitting", "dropout", "epoch", "gradient", "loss", "Scrum", "Kanban", "WIP", "Sprint", "UML", "Merise", "MCD", "MLD", "MVC", "ETL", "OLAP", "OLTP", "HDFS", "MapReduce"],
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCode(code: string, lang: string): string {
  const escaped = escapeHtml(code);
  const kws = KEYWORDS[lang] || KEYWORDS.python;
  const kwPattern = kws.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const re = new RegExp(
    "(#[^\\n]*|--[^\\n]*|\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\.)*'|\\b\\d+(?:\\.\\d+)?\\b|\\b(?:" + kwPattern + ")\\b)",
    "g"
  );
  return escaped.replace(re, (match: string) => {
    if (match.startsWith("#") || match.startsWith("--"))
      return '<span class="tok-com">' + match + "</span>";
    if (match.startsWith('"') || match.startsWith("'"))
      return '<span class="tok-str">' + match + "</span>";
    if (/^\d/.test(match))
      return '<span class="tok-num">' + match + "</span>";
    return '<span class="tok-kw">' + match + "</span>";
  });
}

// Couleur signature par fiche
const SHEET_COLORS: Record<string, string> = {
  PYTHON: "#3776ab",
  PANDAS: "#9333ea",
  NUMPY: "#4dabcf",
  SCIPY: "#64748b",
  R: "#276dc3",
  SQL: "#b45309",
  MACHINE_LEARNING: "#0ea5e9",
  DEEP_LEARNING: "#ef4444",
  ANALYSE_CONCEPTION: "#8b5cf6",
  GESTION_PROJET: "#10b981",
  BIG_DATA: "#f97316",
};

function sheetColor(id: string): string {
  return SHEET_COLORS[id] || "#2563eb";
}

function sheetLang(id: string): string {
  if (id === "PYTHON" || id === "PANDAS" || id === "NUMPY") return "python";
  if (id === "R") return "r";
  if (id === "SQL") return "sql";
  return "concepts";
}

export default function CheatSheetsPage() {
  const [sheets, setSheets] = useState<CheatSheet[]>([]);
  const [current, setCurrent] = useState<CheatSheet | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const loaded: CheatSheet[] = [];
      for (const id of SHEET_FILES) {
        try {
          const res = await fetch(`/cheatsheets/${id}.json`);
          if (res.ok) loaded.push(await res.json());
        } catch {
          // fiche absente : on ignore
        }
      }
      setSheets(loaded);
      setLoading(false);
      // Restauration après un rechargement : l'entrée d'historique
      // courante porte peut-être encore une fiche ouverte.
      const restoredId = window.history.state?.cheatsheetId;
      if (restoredId) {
        const restored = loaded.find((s) => s.id === restoredId);
        if (restored) setCurrent(restored);
      }
    };
    load();
  }, []);

  // Navigation historique : ouvrir une fiche pousse une entrée, le
  // retour du navigateur (réflexe mobile) ramène à la liste, l'avant
  // rouvre la fiche. Jamais de sortie de la section par « retour ».
  const openSheet = (sheet: CheatSheet) => {
    setCurrent(sheet);
    setQuery("");
    window.history.pushState({ cheatsheetId: sheet.id }, "");
  };

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const id = e.state?.cheatsheetId;
      const sheet = id ? sheets.find((s) => s.id === id) ?? null : null;
      setCurrent(sheet);
      if (!sheet) setQuery("");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [sheets]);

  const q = query.trim().toLowerCase();

  // Fiche courante filtrée par la recherche
  const filteredSections = useMemo(() => {
    if (!current) return [];
    if (!q) return current.sections;
    return current.sections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (it) =>
            it.what.toLowerCase().includes(q) ||
            (it.code || "").toLowerCase().includes(q) ||
            (it.note || "").toLowerCase().includes(q) ||
            s.title.toLowerCase().includes(q)
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [current, q]);

  // Résultats de recherche transverses (toutes les fiches) quand aucune fiche ouverte
  const globalResults = useMemo(() => {
    if (!q || current) return [];
    const out: { sheet: CheatSheet; section: string; item: CheatItem }[] = [];
    for (const sheet of sheets) {
      for (const s of sheet.sections) {
        for (const it of s.items) {
          if (
            it.what.toLowerCase().includes(q) ||
            (it.code || "").toLowerCase().includes(q) ||
            (it.note || "").toLowerCase().includes(q)
          ) {
            out.push({ sheet, section: s.title, item: it });
          }
        }
      }
    }
    return out.slice(0, 30);
  }, [q, current, sheets]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement des cheat sheets...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-12">
        <PageHeader
          title="Cheat Sheets"
          description="Fiches de référence : ça sert à quoi, comment on l'écrit, les pièges"
          actions={
            current ? (
              <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Toutes les fiches
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
                Retour
              </Button>
            )
          }
        />

        {/* Recherche (toujours disponible) */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={current ? `Chercher dans « ${current.title} »...` : "Chercher dans toutes les fiches (ex. groupby, HAVING, dropout...)"}
            className="w-full pl-10 pr-10 py-3 bg-paper-secondary border border-paper-dark rounded font-mono text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-accent"
              aria-label="Effacer la recherche"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Vue : résultats globaux de recherche */}
        {!current && q && (
          <div className="space-y-3">
            <p className="font-mono text-sm text-ink-muted">
              {globalResults.length} résultat{globalResults.length > 1 ? "s" : ""} pour « {query} »
            </p>
            {globalResults.map(({ sheet, section, item }, idx) => (
              <Card key={idx}>
                <CardContent>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge variant="default">{sheet.title}</Badge>
                    <span className="font-mono text-xs text-ink-muted">{section}</span>
                  </div>
                  <p className="font-sans font-semibold">{item.what}</p>
                  {item.code && (
                    <pre
                      className="code-block mt-2 p-3 rounded-lg font-mono text-xs whitespace-pre-wrap overflow-x-auto"
                      dangerouslySetInnerHTML={{
                        __html: highlightCode(item.code, sheetLang(sheet.id)),
                      }}
                    />
                  )}
                  {item.note && (
                    <p className="mt-2 text-xs text-ink-muted italic">{item.note}</p>
                  )}
                </CardContent>
              </Card>
            ))}
            {globalResults.length === 0 && (
              <p className="text-sm text-ink-muted">
                Aucun résultat. Ouvre une fiche et cherche dedans, ou essaie un autre mot.
              </p>
            )}
          </div>
        )}

        {/* Vue : liste des fiches */}
        {!current && !q && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sheets.map((sheet) => (
              <Card key={sheet.id} hoverable className="cursor-pointer border-t-4" style={{ borderTopColor: sheetColor(sheet.id) }} onClick={() => openSheet(sheet)}>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${sheetColor(sheet.id)}22` }}
                    >
                      <FileText className="w-5 h-5" style={{ color: sheetColor(sheet.id) }} />
                    </div>
                    <div>
                      <h3 className="font-mono font-semibold mb-1">{sheet.title}</h3>
                      <p className="text-xs text-ink-muted line-clamp-3">{sheet.description}</p>
                      <p className="font-mono text-xs text-ink-muted mt-2">
                        {sheet.sections.length} sections •{" "}
                        {sheet.sections.reduce((a, s) => a + s.items.length, 0)} entrées
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Vue : une fiche ouverte */}
        {current && (
          <div className="space-y-6">
            <Card className="border-t-4" style={{ borderTopColor: sheetColor(current.id) }}>
              <CardContent>
                <div className="flex items-start gap-3">
                  <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${sheetColor(current.id)}22` }}
                  >
                    <FileText className="w-6 h-6" style={{ color: sheetColor(current.id) }} />
                  </div>
                  <div>
                    <h2 className="font-mono font-bold text-xl mb-1">{current.title}</h2>
                    <p className="text-sm text-ink-secondary">{current.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {filteredSections.map((section) => (
              <Card
                key={section.title}
                className="border-l-4"
                style={{ borderLeftColor: sheetColor(current.id) }}
              >
                <CardContent>
                  <h3
                    className="font-mono font-semibold mb-4 flex items-center gap-2"
                    style={{ color: sheetColor(current.id) }}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: sheetColor(current.id) }}
                    />
                    {section.title}
                  </h3>
                  <div className="space-y-4">
                    {section.items.map((item, i) => (
                      <div
                        key={i}
                        className="border border-paper-dark rounded-lg p-4 bg-paper-secondary/50 md:grid md:grid-cols-[2fr_3fr] md:gap-4"
                      >
                        <div>
                          <p className="font-sans font-semibold mb-2">{item.what}</p>
                          {item.note && (
                            <p className="text-xs italic text-ink-muted">{item.note}</p>
                          )}
                        </div>
                        {item.code && (
                          <pre
                            className="code-block mt-2 md:mt-0 md:self-center p-3 rounded-lg font-mono text-xs whitespace-pre-wrap overflow-x-auto"
                            dangerouslySetInnerHTML={{
                              __html: highlightCode(item.code, sheetLang(current.id)),
                            }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredSections.length === 0 && (
              <p className="text-sm text-ink-muted">
                Rien ne correspond à « {query} » dans cette fiche.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
