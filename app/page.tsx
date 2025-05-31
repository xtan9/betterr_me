"use client";

import { AuthButton } from "@/components/auth-button";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLanguage } from "@/lib/i18n/context";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle, Calendar, BarChart, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Home() {
  const { t } = useLanguage();

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="w-full flex flex-col items-center">
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

        <div className="flex flex-col gap-8 max-w-6xl w-full p-4 sm:p-6 lg:p-8">
          {/* Hero Text Section */}
          <div className="flex flex-col items-center text-center gap-6 py-8 lg:py-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              {t("hero.title")}{" "}
              <span className="text-primary">{t("hero.titleHighlight")}</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl leading-relaxed">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center justify-center rounded-lg text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 py-3"
              >
                {t("nav.getStarted")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center rounded-lg text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-12 px-8 py-3"
              >
                {t("nav.signIn")}
              </Link>
            </div>
          </div>

          {/* Hero Image */}
          <div className="relative w-full">
            <div className="relative w-full h-48 sm:h-64 md:h-80 lg:h-96 rounded-3xl overflow-hidden shadow-xl">
              <Image
                src="https://images.unsplash.com/photo-1593811167562-9cef47bfc4d7?w=800&h=600&fit=crop"
                alt="Person achieving goals"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 1000px"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          </div>

          {/* Features Section */}
          <div className="grid gap-8 md:grid-cols-3 mt-8">
            <Card className="hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
              <div className="relative h-48 w-full rounded-t-xl overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400&h=300&fit=crop"
                  alt="Daily tracking"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px"
                  className="object-cover"
                />
              </div>
              <CardHeader className="pb-3">
                <Calendar className="h-8 w-8 text-primary mb-3" />
                <CardTitle className="text-xl">{t("features.dailyTracking.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">{t("features.dailyTracking.description")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
              <div className="relative h-48 w-full rounded-t-xl overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=300&fit=crop"
                  alt="Progress insights"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px"
                  className="object-cover"
                />
              </div>
              <CardHeader className="pb-3">
                <BarChart className="h-8 w-8 text-primary mb-3" />
                <CardTitle className="text-xl">{t("features.progressInsights.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">{t("features.progressInsights.description")}</CardDescription>
              </CardContent>
            </Card>

            <Card className="hover:shadow-xl transition-all duration-300 border-0 shadow-lg">
              <div className="relative h-48 w-full rounded-t-xl overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1552581234-26160f608093?w=400&h=300&fit=crop"
                  alt="Stay motivated"
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 400px"
                  className="object-cover"
                />
              </div>
              <CardHeader className="pb-3">
                <Sparkles className="h-8 w-8 text-primary mb-3" />
                <CardTitle className="text-xl">{t("features.stayMotivated.title")}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base leading-relaxed">{t("features.stayMotivated.description")}</CardDescription>
              </CardContent>
            </Card>
          </div>

          {/* CTA Section with background image */}
          <Card className="relative overflow-hidden mb-8 mt-8 border-0 shadow-lg">
            <div className="absolute inset-0 z-0">
              <Image
                src="https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=1200&h=400&fit=crop"
                alt="Start your journey"
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw, 1200px"
                className="object-cover opacity-10"
              />
            </div>
            <CardHeader className="text-center py-8">
              <CardTitle className="text-2xl lg:text-3xl">{t("cta.title")}</CardTitle>
            </CardHeader>
            <CardContent className="text-center pb-8">
              <CardDescription className="max-w-2xl mx-auto text-lg mb-6">
                {t("cta.subtitle")}
              </CardDescription>
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center justify-center rounded-lg text-base font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 py-3"
              >
                {t("cta.button")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
