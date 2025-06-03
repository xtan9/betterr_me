"use client";

import { useLanguage } from "@/lib/i18n/context";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "@/components/navbar";
import Hero from "@/components/hero";
import Footer from "@/components/footer";
import {
  ArrowUpRight,
  Calendar,
  Target,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";

export default function Home() {
  const { t } = useLanguage();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // User is authenticated, redirect to protected page
        router.push("/dashboard");
        return;
      }
      
      setIsLoading(false);
    }
    
    checkAuth();
  }, [router]);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      <Navbar />
      <Hero />

      {/* Features Section */}
      <section className="py-24 bg-background" id="features">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4 text-foreground">
              {t("features.everythingYouNeed")}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("features.powerfulTools")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <CheckCircle2 className="w-6 h-6" />,
                title: t("features.dailyTracking.title"),
                description: t("features.dailyTracking.description"),
              },
              {
                icon: <Calendar className="w-6 h-6" />,
                title: t("features.calendarView.title"),
                description: t("features.calendarView.description"),
              },
              {
                icon: <Target className="w-6 h-6" />,
                title: t("features.customGoals.title"),
                description: t("features.customGoals.description"),
              },
              {
                icon: <TrendingUp className="w-6 h-6" />,
                title: t("features.progressInsights.title"),
                description: t("features.progressInsights.description"),
              },
            ].map((feature, index) => (
              <div
                key={index}
                className="p-6 bg-card rounded-xl shadow-sm hover:shadow-md transition-shadow border"
              >
                <div className="text-blue-600 mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2 text-card-foreground">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-20 bg-blue-600 text-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              {t("stats.joinCommunity")}
            </h2>
            <p className="text-blue-100 max-w-2xl mx-auto">
              {t("stats.subtitle")}
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">{t("stats.habitsTracked")}</div>
              <div className="text-blue-100">{t("stats.habitsTrackedLabel")}</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">{t("stats.activeUsers")}</div>
              <div className="text-blue-100">{t("stats.activeUsersLabel")}</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">{t("stats.successRate")}</div>
              <div className="text-blue-100">{t("stats.successRateLabel")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-secondary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4 text-secondary-foreground">
            {t("cta.title")}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            {t("cta.subtitle")}
          </p>
          <a
            href="/auth/sign-up"
            className="inline-flex items-center px-6 py-3 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t("cta.button")}
            <ArrowUpRight className="ml-2 w-4 h-4" />
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}
