"use client";

import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { useLanguage } from "@/lib/i18n/context";

export default function Hero() {
  const { t } = useLanguage();

  // Helper function to check if a translation key exists and has a value
  const hasTranslation = (key: string) => {
    const value = t(key);
    return value && value !== key;
  };

  return (
    <div className="relative overflow-hidden bg-background">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-background to-purple-50 opacity-70 dark:from-blue-950/20 dark:to-purple-950/20" />

      <div className="relative pt-24 pb-32 sm:pt-32 sm:pb-40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl sm:text-6xl font-bold text-foreground mb-8 tracking-tight">
              {t("hero.title")}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                {t("hero.titleHighlight")}
              </span>
              {hasTranslation("hero.titleHighlight2") && (
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600"> {t("hero.titleHighlight2")}</span>
              )}
              {hasTranslation("hero.titleSuffix") && (
                <span className="text-foreground"> {t("hero.titleSuffix")}</span>
              )}
            </h1>

            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              {t("hero.subtitle")}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center px-8 py-4 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium"
              >
                {t("nav.getStarted")}
                <ArrowUpRight className="ml-2 w-5 h-5" />
              </Link>

              <Link
                href="#features"
                className="inline-flex items-center px-8 py-4 text-secondary-foreground bg-secondary rounded-lg hover:bg-secondary/80 transition-colors text-lg font-medium"
              >
                {t("nav.learnMore")}
              </Link>
            </div>

            <div className="mt-16 flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                <span>{t("features.freeToUse")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                <span>{t("features.unlimitedHabits")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                <span>{t("features.visualProgress")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 