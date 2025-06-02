export type Language = "en" | "zh" | "zh-TW";

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isLoading: boolean;
}

export interface TranslationStructure {
  nav: {
    getStarted: string;
    signIn: string;
    signOut: string;
    dashboard: string;
    learnMore: string;
  };
  hero: {
    title: string;
    titleHighlight: string;
    titleHighlight2: string;
    titleSuffix?: string;
    subtitle: string;
  };
  features: {
    freeToUse: string;
    unlimitedHabits: string;
    visualProgress: string;
    everythingYouNeed: string;
    powerfulTools: string;
    dailyTracking: {
      title: string;
      description: string;
    };
    calendarView: {
      title: string;
      description: string;
    };
    customGoals: {
      title: string;
      description: string;
    };
    progressInsights: {
      title: string;
      description: string;
    };
    stayMotivated: {
      title: string;
      description: string;
    };
  };
  stats: {
    joinCommunity: string;
    subtitle: string;
    habitsTracked: string;
    habitsTrackedLabel: string;
    activeUsers: string;
    activeUsersLabel: string;
    successRate: string;
    successRateLabel: string;
  };
  cta: {
    title: string;
    subtitle: string;
    button: string;
  };
  footer: {
    product: string;
    features: string;
    habitTemplates: string;
    mobileApp: string;
    company: string;
    about: string;
    blog: string;
    careers: string;
    press: string;
    resources: string;
    documentation: string;
    helpCenter: string;
    community: string;
    status: string;
    legal: string;
    privacy: string;
    terms: string;
    security: string;
    cookies: string;
    allRightsReserved: string;
  };
  dashboard: {
    welcome: string;
    profile: string;
    email: string;
    accountCreated: string;
  };
}

export type TranslationsType = Record<Language, TranslationStructure>; 