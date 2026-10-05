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
// quoi / comment on l'écrit / pièges. Cherchable,
// consultable hors ligne (cache SW).
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
  "R",
  "SQL",
  "MACHINE_LEARNING",
  "DEEP_LEARNING",
  "ANALYSE_CONCEPTION",
  "GESTION_PROJET",
  "BIG_DATA",
];

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
    };
    load();
  }, []);

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
              <Button variant="secondary" size="sm" onClick={() => { setCurrent(null); setQuery(""); }}>
                <ChevronLeft className="w-4 h-4 mr-2" />
                Toutes les fiches
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => router_back()}>
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
                  <p className="font-serif">{item.what}</p>
                  {item.code && (
                    <pre className="mt-2 p-3 bg-paper-dark/60 rounded font-mono text-xs text-ink-secondary whitespace-pre-wrap overflow-x-auto">
                      {item.code}
                    </pre>
                  )}
                  {item.note && (
                    <p className="mt-2 text-xs text-ink-muted italic font-serif">{item.note}</p>
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
              <Card key={sheet.id} hoverable className="cursor-pointer" onClick={() => setCurrent(sheet)}>
                <CardContent>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded bg-accent/10 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-accent" />
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
            <Card>
              <CardContent>
                <div className="flex items-start gap-3">
                  <BookOpen className="w-6 h-6 text-accent shrink-0 mt-1" />
                  <div>
                    <h2 className="font-mono font-bold text-xl mb-1">{current.title}</h2>
                    <p className="text-sm text-ink-secondary">{current.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {filteredSections.map((section) => (
              <Card key={section.title}>
                <CardContent>
                  <h3 className="font-mono font-semibold text-accent mb-4">
                    {section.title}
                  </h3>
                  <div className="space-y-4">
                    {section.items.map((item, i) => (
                      <div
                        key={i}
                        className="border border-paper-dark rounded p-4 bg-paper-secondary/50"
                      >
                        <p className="font-serif font-semibold mb-2">{item.what}</p>
                        {item.code && (
                          <pre className="p-3 bg-paper-dark/60 rounded font-mono text-xs text-ink-secondary whitespace-pre-wrap overflow-x-auto mb-2">
                            {item.code}
                          </pre>
                        )}
                        {item.note && (
                          <p className={cn("text-xs italic font-serif", item.code ? "text-ink-muted" : "text-ink-secondary")}>
                            {item.note}
                          </p>
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

function router_back() {
  if (typeof window !== "undefined") window.history.back();
}
