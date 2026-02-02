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
  WifiOff,
  TrendingUp,
  Target,
  Clock,
  Award,
  Calendar,
} from "lucide-react";
import { storageService } from "@/services/StorageService";
import { statisticsService } from "@/services/StatisticsService";
import { indexedDBService } from "@/services/IndexedDBService";
import { QuizSession } from "@/types";

// ============================================
// HOME PAGE
// Dashboard with stats and 4 mode cards
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
    description: "Révisez domaine par domaine avec des QCM générés à la demande",
    href: "/practice",
    icon: BookOpen,
    color: "var(--domain-dl)",
  },
  {
    title: "Examen",
    description: "Simulez un examen complet ou par domaine avec limite de temps",
    href: "/exam",
    icon: FileText,
    color: "var(--domain-ml)",
    badge: "2h",
  },
  {
    title: "Favoris",
    description: "Retrouvez vos questions marquées pour les réviser",
    href: "/favorites",
    icon: Star,
    color: "var(--accent-vivid)",
  },
  {
    title: "Hors Ligne",
    description: "Accédez aux exercices téléchargés sans connexion",
    href: "/offline",
    icon: WifiOff,
    color: "var(--domain-bigdata)",
  },
];

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
  });
  const [recentSessions, setRecentSessions] = useState<QuizSession[]>([]);

  useEffect(() => {
    const checkOnboarding = async () => {
      const completed = await storageService.isOnboardingCompleted();
      setChecking(false);

      if (!completed) {
        router.replace("/onboarding");
        return;
      }

      setMounted(true);

      // Load statistics
      await loadStatistics();

      // Load recent sessions
      await loadRecentSessions();
    };

    checkOnboarding();
  }, []);

  const loadStatistics = async () => {
    try {
      setStatsLoading(true);
      await indexedDBService.init();
      await statisticsService.init();
      const formattedStats = await statisticsService.getFormattedStats();
      console.log('[HomePage] Loaded statistics:', formattedStats);
      setStats(formattedStats);
    } catch (error) {
      console.error('[HomePage] Failed to load statistics:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadRecentSessions = async () => {
    try {
      const allSessions = await indexedDBService.getAllSessions();
      const completedSessions = allSessions
        .filter((s) => s.status === "COMPLETED")
        .sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime())
        .slice(0, 3);

      console.log('[HomePage] Loaded', completedSessions.length, 'recent sessions');
      setRecentSessions(completedSessions);
    } catch (error) {
      console.error('[HomePage] Failed to load recent sessions:', error);
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

  return (
    <div className="min-h-screen flex flex-col bg-paper-primary">
      <Navigation />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Header
          title="Tableau de Bord"
          subtitle="Bienvenue sur Review IABD - Votre application de révision"
        />

        {/* Quick Stats */}
        <section className="mb-12">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {MODES.map((mode, index) => {
              const Icon = mode.icon;
              return (
                <Link key={mode.href} href={mode.href}>
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
                          <p className="text-sm text-ink-secondary">
                            {mode.description}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

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
                    Commencez par générer vos premières questions en mode Pratique
                  </p>
                  <Link href="/practice">
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
                  <Link key={session.id} href={`/quiz?session=${session.id}`}>
                    <Card hoverable className="h-full">
                      <CardContent>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-xs text-ink-muted">
                                {session.type === "exam" ? "EXAMEN" : "PRATIQUE"}
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
    </div>
  );
}
