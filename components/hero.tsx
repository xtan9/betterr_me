import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { getTranslations } from 'next-intl/server';

export default async function Hero() {
  const homeT = await getTranslations('home');
  const navT = await getTranslations('common.nav');

  // Helper function to check if a translation key exists and has a value
  const hasTranslation = (translator: (key: string) => string, key: string): boolean => {
    try {
      const value = translator(key);
      return typeof value === 'string' && value !== '' && value !== key;
    } catch {
      return false;
    }
  };

  return (
    <div className="relative overflow-hidden bg-background">
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-background to-purple-50 opacity-70 dark:from-blue-950/20 dark:to-purple-950/20" />

      <div className="relative pt-24 pb-32 sm:pt-32 sm:pb-40">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl sm:text-6xl font-bold text-foreground mb-8 tracking-tight">
              {homeT("hero.title")}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                {homeT("hero.titleHighlight")}
              </span>
              {hasTranslation(homeT, "hero.titleHighlight2") && (
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600"> {homeT("hero.titleHighlight2")}</span>
              )}
              {hasTranslation(homeT, "hero.titleSuffix") && (
                <span className="text-foreground"> {homeT("hero.titleSuffix")}</span>
              )}
            </h1>

            <p className="text-xl text-muted-foreground mb-12 max-w-2xl mx-auto leading-relaxed">
              {homeT("hero.subtitle")}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <Link
                href="/auth/signup"
                className="inline-flex items-center px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
              >
                {navT("getStarted")}
                <ArrowUpRight className="ml-2 w-5 h-5" />
              </Link>

              <Link
                href="#features"
                className="inline-flex items-center px-8 py-4 border border-border bg-background hover:bg-secondary text-foreground font-semibold rounded-lg transition-colors"
              >
                {navT("learnMore")}
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap justify-center items-center gap-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>{homeT("features.freeToUse")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>{homeT("features.unlimitedHabits")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                <span>{homeT("features.visualProgress")}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 