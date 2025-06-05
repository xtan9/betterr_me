import { getTranslations } from 'next-intl/server';
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Middleware now handles redirecting authenticated users to dashboard

  const t = await getTranslations('home');

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
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4 text-foreground">
            {t("cta.title")}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            {t("cta.subtitle")}
          </p>
          <button className="inline-flex items-center px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl">
            {t("cta.button")}
            <ArrowUpRight className="ml-2 w-5 h-5" />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
