"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navigation } from "@/components/layout/Navigation";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatsCard, StatsGrid } from "@/components/features/StatsCard";
import { Badge } from "@/components/ui/Badge";
import { DomainBadge } from "@/components/features/DomainSelector";
import {
  BookOpen,
  FileText,
  Star,
  TrendingUp,
  Target,
  Clock,
  Award,
  Calendar,
  Flame,
  AlertCircle,
  ScrollText,
  Download,
  Play,
  BookMarked,
} from "lucide-react";
import { storageService } from "@/services/StorageService";
import { statisticsService } from "@/services/StatisticsService";
import { indexedDBService } from "@/services/IndexedDBService";
import { mistakesService } from "@/services/MistakesService";
import { dailyStatsService } from "@/services/DailyStatsService";
import { questionBank } from "@/services/QuestionBankService";
import { QuizSession, Domain } from "@/types";
import { ProductTour, HOME_TOUR_STEPS } from "@/components/ProductTour";

// ============================================
// HOME PAGE : tableau de bord
// Stats, objectif du jour, streak, révision due,
// compte à rebours d'examen, progression par matière.
// ============================================

interface ModeCard {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badge?: string;
}

const MODES: ModeCard[] = [
  {
    title: "Pratique",
    description: "Banque locale embarquée (hors ligne) : QCM, multi-réponses, V/F, trous, code, cas pratiques",
    href: "/practice",
    icon: BookOpen,
    color: "var(--domain-dl)",
  },
  {
    title: "Examen blanc",
    description: "40 questions / 2h, correction masquée, tirage équilibré entre les matières",
    href: "/exam",
    icon: FileText,
    color: "var(--domain-ml)",
    badge: "2h",
  },
  {
    title: "Épreuves réelles",
    description: "Les vrais sujets IABD transcrits avec corrigés détaillés",
    href: "/mock-exams",
    icon: ScrollText,
    color: "var(--accent-vivid)",
  },
  {
    title: "Cahier d'erreurs",
    description: "Tes erreurs reviennent au bon moment (répétition espacée)",
    href: "/mistakes",
    icon: AlertCircle,
    color: "var(--domain-gp)",
  },
  {
    title: "Favoris",
    description: "Retrouve tes questions marquées et teste-toi dessus",
    href: "/favorites",
    icon: Star,
    color: "var(--domain-ai)",
  },
  {
    title: "Importer",
    description: "Génère des questions avec ton abonnement IA (sans clé API) et ajoute-les à ta banque",
    href: "/import",
    icon: Download,
    color: "var(--domain-rec)",
  },
  {
    title: "Cheat Sheets",
    description: "Fiches de référence par matière : fonctions, formules, syntaxe, pièges",
    href: "/cheatsheets",
    icon: BookMarked,
    color: "var(--domain-sql)",
  },
];

function todayKeyLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalQuestions: 0,
    totalCorrect: 0,
    totalExams: 0,
    averageScore: 0,
    studyTimeMinutes: 0,
    studyTimeHours: 0,
    favoriteCount: 0,
    domains: {} as Record<string, { questionsAnswered: number; correctAnswers: number; averageScore: number }>,
  });
  const [recentSessions, setRecentSessions] = useState<QuizSession[]>([]);
  const [streak, setStreak] = useState(0);
  const [dailyGoal, setDailyGoal] = useState(20);
  const [todayAnswered, setTodayAnswered] = useState(0);
  const [dueMistakes, setDueMistakes] = useState(0);
  const [bankTotal, setBankTotal] = useState(0);
  const [examCountdown, setExamCountdown] = useState<number | null>(null);
  const [examLabel, setExamLabel] = useState<string>("");

  useEffect(() => {
    const init = async () => {
      const completed = await storageService.isOnboardingCompleted();
      setChecking(false);

      if (!completed) {
        router.replace("/onboarding");
        return;
      }

      setMounted(true);
      await loadDashboard();
    };

    init();
  }, []);

  const loadDashboard = async () => {
    try {
      setStatsLoading(true);
      await indexedDBService.init();
      await statisticsService.init();

      const formattedStats = await statisticsService.getFormattedStats();
      setStats(formattedStats as any);

      const settings = await storageService.getSettings();
      const goal = settings.dailyGoal || 20;
      setDailyGoal(goal);

      const [streakValue, today, dueCount, bankStats, allSessions] = await Promise.all([
        dailyStatsService.getStreak(goal),
        dailyStatsService.getToday(),
        mistakesService.getDueCount(),
        questionBank.getStats(),
        indexedDBService.getAllSessions(),
      ]);

      setStreak(streakValue);
      setTodayAnswered(today.answered);
      setDueMistakes(dueCount);
      setBankTotal(bankStats.total);

      const completedSessions = allSessions
        .filter((s) => s.status === "COMPLETED")
        .sort(
          (a, b) =>
            new Date(b.completedAt || b.startedAt).getTime() -
            new Date(a.completedAt || a.startedAt).getTime()
        )
        .slice(0, 3);
      setRecentSessions(completedSessions);

      // Compte à rebours d'examen
      if (settings.examDate) {
        const target = new Date(`${settings.examDate}T08:00:00`);
        const days = Math.ceil((target.getTime() - Date.now()) / 86_400_000);
        if (days >= 0) setExamCountdown(days);
        setExamLabel("Examens IABD");
      }
    } catch (error) {
      console.error("[HomePage] Failed to load dashboard:", error);
    } finally {
      setStatsLoading(false);
    }
  };

  const calculateSessionScore = (session: QuizSession): number => {
    if (!session.questions || !session.userAnswers) return 0;
    let correct = 0;
    let answered = 0;
    session.questions.forEach((q) => {
      const userAnswer = session.userAnswers[q.id];
      if (userAnswer) {
        answered++;
        if (userAnswer.isCorrect) {
          correct++;
        }
      }
    });
    return answered > 0 ? Math.round((correct / answered) * 100) : 0;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-domain-dl";
    if (score >= 60) return "text-domain-ai";
    return "text-domain-ml";
  };

  if (checking || !mounted) {
    return (
      <div className="min-h-screen flex flex-col bg-paper-primary">
        <Navigation />
        <main className="flex-1 flex items-center justify-center">
          <p className="font-mono text-ink-muted">Chargement...</p>
        </main>
      </div>
    );
  }

  const goalPercent = Math.min(100, Math.round((todayAnswered / Math.max(1, dailyGoal)) * 100));
  const goalDone = todayAnswered >= dailyGoal;

  const activeDomains = (Object.entries(stats.domains) as [Domain, any][]).filter(
    ([, p]) => p && p.questionsAnswered > 0
  );
  activeDomains.sort((a, b) => b[1].averageScore - a[1].averageScore);

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Header
          title="Tableau de Bord"
          subtitle="Bienvenue sur Review IABD : tout fonctionne hors ligne, la banque locale est embarquée"
        />

        {/* Aujourd'hui : streak + objectif + révision due + compte à rebours */}
        <section className="mb-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Objectif du jour + streak */}
            <div data-tour="today">
            <Card className="h-full">
              <CardContent>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-mono font-semibold text-sm">Aujourd&apos;hui</h3>
                  <div className="flex items-center gap-1 font-mono text-sm text-accent">
                    <Flame className={`w-4 h-4 ${streak > 0 ? "text-accent" : "text-ink-muted"}`} />
                    {streak} jour{streak > 1 ? "s" : ""}
                  </div>
                </div>
                <p className="font-mono text-xs text-ink-muted uppercase mb-2">
                  Objectif : {todayAnswered}/{dailyGoal} questions
                </p>
                <div className="h-2 rounded-full bg-paper-dark overflow-hidden">
                  <div
                    className={`h-full transition-all ${goalDone ? "bg-domain-dl" : "bg-accent"}`}
                    style={{ width: `${goalPercent}%` }}
                  />
                </div>
                <p className="text-xs text-ink-muted mt-2">
                  {goalDone
                    ? "Objectif atteint, la série continue !"
                    : `Encore ${Math.max(0, dailyGoal - todayAnswered)} questions pour tenir la série.`}
                </p>
              </CardContent>
            </Card>

            </div>

            {/* Révision du jour (cahier d'erreurs) */}
            <div data-tour="revision">
            <Card className="h-full">
              <CardContent>
                <h3 className="font-mono font-semibold text-sm mb-3">Révision du jour</h3>
                {dueMistakes > 0 ? (
                  <>
                    <p className="text-sm text-ink-secondary mb-3">
                      <span className="font-mono font-bold text-accent">{dueMistakes}</span>{" "}
                      question{dueMistakes > 1 ? "s" : ""} ratée
                      {dueMistakes > 1 ? "s" : ""} à revoir aujourd&apos;hui.
                    </p>
                    <Link href="/mistakes">
                      <Button variant="primary" size="sm">
                        <Play className="w-4 h-4 mr-2" />
                        Réviser maintenant
                      </Button>
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">
                    Rien à revoir pour le moment. Continue à réviser, les erreurs reviendront
                    automatiquement au bon moment.
                  </p>
                )}
              </CardContent>
            </Card>

            </div>

            {/* Compte à rebours + banque */}
            <div data-tour="exam">
            <Card className="h-full">
              <CardContent>
                <h3 className="font-mono font-semibold text-sm mb-3">Cap sur l&apos;examen</h3>
                {examCountdown !== null ? (
                  <p className="text-sm text-ink-secondary mb-2">
                    <span className="font-mono text-3xl font-bold text-accent mr-2">
                      {examCountdown}
                    </span>
                    jour{examCountdown > 1 ? "s" : ""} avant {examLabel}
                  </p>
                ) : (
                  <p className="text-sm text-ink-muted mb-2">
                    Fixe ta date d&apos;examen dans les paramètres pour voir le compte à rebours
                    ici.
                  </p>
                )}
                <p className="font-mono text-xs text-ink-muted">
                  Banque locale : {bankTotal} questions prêtes (hors ligne).
                </p>
                {examCountdown === null && (
                  <Link href="/settings" className="inline-block mt-2">
                    <Button variant="secondary" size="sm">
                      Définir la date
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
            </div>
          </div>
        </section>

        {/* Quick Stats */}
        <section className="mb-12" data-tour="stats">
          <h2 className="font-mono font-semibold text-lg mb-6 flex items-center gap-3">
            <div className="w-2 h-6 bg-accent" />
            Statistiques Globales
          </h2>
          <StatsGrid columns={4}>
            <StatsCard
              label="Questions Répondues"
              value={statsLoading ? "..." : stats.totalQuestions.toString()}
              icon={<Target className="w-5 h-5" />}
            />
            <StatsCard
              label="Examens Passés"
              value={statsLoading ? "..." : stats.totalExams.toString()}
              icon={<FileText className="w-5 h-5" />}
            />
            <StatsCard
              label="Score Moyen"
              value={statsLoading ? "--" : stats.averageScore.toString()}
              unit="%"
              icon={<TrendingUp className="w-5 h-5" />}
            />
            <StatsCard
              label="Temps d'Étude"
              value={statsLoading ? "0" : stats.studyTimeMinutes.toString()}
              unit="min"
              icon={<Clock className="w-5 h-5" />}
            />
          </StatsGrid>
        </section>

        {/* Mode Cards */}
        <section className="mb-12">
          <h2 className="font-mono font-semibold text-lg mb-6 flex items-center gap-3">
            <div className="w-2 h-6 bg-accent" />
            Modes de Révision
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-tour="modes">
            {MODES.map((mode) => {
              const Icon = mode.icon;
              return (
                <Link key={mode.href} href={mode.href} prefetch={false}>
                  <Card hoverable className="h-full animate-fade-in-up">
                    <CardContent>
                      <div className="flex items-start gap-4">
                        <div
                          className="flex-shrink-0 w-12 h-12 rounded flex items-center justify-center"
                          style={{ backgroundColor: `${mode.color}20` }}
                        >
                          <span style={{ color: mode.color }}>
                            <Icon className="w-6 h-6" />
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle>{mode.title}</CardTitle>
                            {mode.badge && <Badge>{mode.badge}</Badge>}
                          </div>
                          <p className="text-sm text-ink-secondary">{mode.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Progression par matière */}
        {activeDomains.length > 0 && (
          <section className="mb-12">
            <h2 className="font-mono font-semibold text-lg mb-6 flex items-center gap-3">
              <div className="w-2 h-6 bg-accent" />
              Progression par matière
            </h2>
            <Card>
              <CardContent>
                <div className="space-y-4">
                  {activeDomains.map(([domain, progress]) => (
                    <div key={domain} className="flex items-center gap-4">
                      <div className="w-32 shrink-0">
                        <DomainBadge domain={domain} />
                      </div>
                      <div className="flex-1">
                        <div className="h-2 rounded-full bg-paper-dark overflow-hidden">
                          <div
                            className={`h-full ${
                              progress.averageScore >= 70
                                ? "bg-domain-dl"
                                : progress.averageScore >= 50
                                  ? "bg-domain-ai"
                                  : "bg-domain-ml"
                            }`}
                            style={{ width: `${progress.averageScore}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-28 text-right font-mono text-xs text-ink-muted shrink-0">
                        {progress.averageScore}% ({progress.questionsAnswered} q)
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Recent Activity */}
        <section>
          <h2 className="font-mono font-semibold text-lg mb-6 flex items-center gap-3">
            <div className="w-2 h-6 bg-accent" />
            Activité Récente
          </h2>
          {recentSessions.length === 0 ? (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <Award className="w-16 h-16 mx-auto mb-4 text-ink-muted" />
                  <p className="text-ink-secondary mb-4">
                    Commence ta première session : la banque locale est prête, aucune
                    configuration nécessaire
                  </p>
                  <Link href="/practice" prefetch={false}>
                    <Button variant="primary">Commencer à Réviser</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {recentSessions.map((session) => {
                const score = calculateSessionScore(session);
                const date = new Date(session.completedAt || session.startedAt).toLocaleDateString("fr-FR");

                return (
                  <Link key={session.id} href={`/quiz?session=${session.id}`} prefetch={false}>
                    <Card hoverable className="h-full">
                      <CardContent>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono text-xs text-ink-muted uppercase">
                                {session.label || (session.type === "exam" ? "EXAMEN" : "PRATIQUE")}
                              </span>
                              {session.domain && <DomainBadge domain={session.domain as any} />}
                            </div>
                            <p className="font-mono text-xs text-ink-muted flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {date}
                            </p>
                          </div>
                          <div className={`font-mono text-2xl font-bold ${getScoreColor(score)}`}>
                            {score}%
                          </div>
                        </div>
                        <p className="text-sm text-ink-muted">
                          {session.questions?.length || 0} questions
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
      <ProductTour id="home" flagKey="tour_done_v1" steps={HOME_TOUR_STEPS} />
    </div>
  );
}
