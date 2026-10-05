"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";

// ============================================
// PRODUCT TOUR (générique)
// Visite guidée d'une page : voile assombri +
// projecteur sur l'élément visé, carte
// explicative pas à pas. Chaque page a son
// identifiant (drapeau localStorage) et ses
// étapes ; rejouable depuis les Paramètres
// (clé sessionStorage tour_replay_<id>).
// ============================================

export interface TourStep {
  target?: string; // attribut data-tour de l'élément visé ; absent = carte centrée
  title: string;
  text: string;
}

export const HOME_TOUR_STEPS: TourStep[] = [
  {
    title: "Bienvenue sur Review IABD",
    text: "L'app fonctionne 100 % hors ligne : ta banque de 1 400 questions est embarquée, aucune clé API n'est nécessaire pour réviser. Voici l'essentiel en 30 secondes.",
  },
  {
    target: "today",
    title: "Ton objectif du jour",
    text: "Chaque question répondue alimente ton objectif quotidien et fait avancer ta série de jours (streak). L'objectif se règle dans Paramètres.",
  },
  {
    target: "revision",
    title: "La révision intelligente",
    text: "Les questions que tu rates partent dans ton cahier d'erreurs et reviennent ici au bon moment, grâce à la répétition espacée.",
  },
  {
    target: "modes",
    title: "Six modes de révision",
    text: "Pratique matière par matière, examens blancs chronométrés, épreuves réelles avec corrigés, cahier d'erreurs, favoris et import de questions : tout fonctionne hors ligne.",
  },
  {
    target: "stats",
    title: "Tes statistiques",
    text: "Score moyen, temps d'étude et progression par matière : tu vois exactement où tu en es et ce qui reste à travailler.",
  },
  {
    target: "nav-plus",
    title: "Le menu Plus",
    text: "Cheat Sheets de référence, historique des examens, import de questions sans clé API : tout est regroupé dans ce menu.",
  },
  {
    target: "theme",
    title: "Clair ou sombre",
    text: "Bascule le thème quand tu veux : ton choix est mémorisé d'une session à l'autre.",
  },
  {
    title: "C'est parti !",
    text: "La banque est prête : lance ta première session en mode Pratique. Cette visite est rejouable à tout moment dans Paramètres, rubrique « Visites guidées ».",
  },
];

export function ProductTour({
  id,
  steps,
  flagKey,
}: {
  id: string;
  steps: TourStep[];
  flagKey?: string;
}) {
  const TOUR_FLAG = flagKey ?? `tour_done_${id}`;
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  const position = useCallback(() => {
    const current = steps[stepIndex];
    if (!current?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => setRect(el.getBoundingClientRect()), 380);
  }, [stepIndex, steps]);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  // Déclenchement : première visite de la page OU demande de rejeu des Paramètres
  useEffect(() => {
    const shouldStart =
      localStorage.getItem(TOUR_FLAG) === null ||
      sessionStorage.getItem(`tour_replay_${id}`) === "1";
    if (shouldStart) {
      sessionStorage.removeItem(`tour_replay_${id}`);
      const t = window.setTimeout(start, 700);
      return () => window.clearTimeout(t);
    }
  }, [start, id, TOUR_FLAG]);

  // Positionne le projecteur à chaque étape (et au redimensionnement)
  useEffect(() => {
    if (!active) return;
    position();
    const reposition = () => position();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [active, stepIndex, position]);

  // Échap : termine la visite
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") previous();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  const finish = useCallback(() => {
    setActive(false);
    localStorage.setItem(TOUR_FLAG, new Date().toISOString());
  }, [TOUR_FLAG]);

  const next = useCallback(() => {
    if (isLast) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  }, [isLast, finish]);

  const previous = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  if (!active) return null;

  const pad = 8;
  const spot = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Carte : sous la cible si possible, sinon au-dessus ; centrée si pas de cible
  const cardStyle = (() => {
    const width = Math.min(360, window.innerWidth - 28);
    if (!spot) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width,
      };
    }
    const below = spot.top + spot.height + 14;
    const spaceBelow = window.innerHeight - below;
    const placeBelow = spaceBelow > 210;
    const top = placeBelow ? below : Math.max(14, Math.max(14, spot.top - 14 - 230));
    const left = Math.min(
      Math.max(14, spot.left + spot.width / 2 - width / 2),
      window.innerWidth - width - 14
    );
    return { top, left, width };
  })();

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label="Visite guidée">
      {/* Voile + projecteur */}
      {spot ? (
        <div
          className="absolute rounded-xl ring-2 ring-accent transition-all duration-300"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            boxShadow: "0 0 0 9999px rgba(9, 9, 14, 0.72)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[rgba(9,9,14,0.72)]" />
      )}

      {/* Carte explicative */}
      <div
        className="absolute bg-paper-secondary border border-paper-dark rounded-2xl shadow-2xl p-5 transition-all duration-300"
        style={cardStyle}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            {stepIndex + 1} / {steps.length}
          </span>
          <button
            onClick={finish}
            className="text-ink-muted hover:text-accent transition-colors"
            aria-label="Fermer la visite"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <h3 className="font-mono font-semibold text-base mb-2">{step.title}</h3>
        <p className="text-sm text-ink-secondary leading-relaxed">{step.text}</p>

        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-2 mt-4">
          <div className="flex items-center gap-1.5 mr-auto">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === stepIndex
                    ? "w-4 bg-accent"
                    : "w-1.5 bg-paper-dark"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button variant="secondary" size="sm" className="min-w-0" onClick={previous}>
                Précédent
              </Button>
            )}
            <Button variant="primary" size="sm" className="min-w-0" onClick={next}>
              {isLast ? "Terminer" : "Suivant"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
