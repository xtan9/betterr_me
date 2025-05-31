"use client";

import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/lib/i18n/context";
import Link from "next/link";
import { ArrowRight, CheckCircle, Calendar, BarChart, Sparkles } from "lucide-react";

export default function Home() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
            <div className="flex gap-5 items-center font-semibold">
              <Link href={"/"}>Betterr.me</Link>
            </div>
            <div className="flex items-center gap-4">
              <AuthButton />
              <LanguageSwitcher />
              <ThemeSwitcher />
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          <div className="flex flex-col items-center text-center gap-8">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              {t("hero.title")}{" "}
              <span className="text-primary">{t("hero.titleHighlight")}</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl">
              {t("hero.subtitle")}
            </p>
            <div className="flex gap-4">
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
              >
                {t("nav.getStarted")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              >
                {t("nav.signIn")}
              </Link>
            </div>
          </div>

          {/* Features Section */}
          <div className="grid gap-8 md:grid-cols-3">
            <div className="flex flex-col gap-4 p-6 rounded-lg border bg-card">
              <Calendar className="h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">{t("features.dailyTracking.title")}</h3>
              <p className="text-muted-foreground">
                {t("features.dailyTracking.description")}
              </p>
            </div>
            <div className="flex flex-col gap-4 p-6 rounded-lg border bg-card">
              <BarChart className="h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">{t("features.progressInsights.title")}</h3>
              <p className="text-muted-foreground">
                {t("features.progressInsights.description")}
              </p>
            </div>
            <div className="flex flex-col gap-4 p-6 rounded-lg border bg-card">
              <Sparkles className="h-8 w-8 text-primary" />
              <h3 className="text-xl font-semibold">{t("features.stayMotivated.title")}</h3>
              <p className="text-muted-foreground">
                {t("features.stayMotivated.description")}
              </p>
            </div>
          </div>

          {/* CTA Section */}
          <div className="flex flex-col items-center text-center gap-4 p-8 rounded-lg border bg-card">
            <h2 className="text-2xl font-semibold">{t("cta.title")}</h2>
            <p className="text-muted-foreground max-w-2xl">
              {t("cta.subtitle")}
            </p>
            <Link
              href="/auth/sign-up"
              className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 mt-4"
            >
              {t("cta.button")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
