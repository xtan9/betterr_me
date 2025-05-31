"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Language = "en" | "zh" | "zh-TW";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Helper function to detect language synchronously
const getInitialLanguage = (): Language => {
  if (typeof window === "undefined") return "en";
  
  try {
    // 1. Check saved preference first
    const savedLang = localStorage.getItem("language") as Language;
    if (savedLang && (savedLang === "en" || savedLang === "zh" || savedLang === "zh-TW")) {
      return savedLang;
    }

    // 2. Detect browser language
    const browserLanguages = navigator.languages || [navigator.language];
    
    for (const lang of browserLanguages) {
      const normalizedLang = lang.toLowerCase();
      
      if (normalizedLang === "zh-tw" || normalizedLang === "zh-hant") {
        return "zh-TW";
      }
      if (normalizedLang === "zh-cn" || normalizedLang === "zh-hans") {
        return "zh";
      }
      if (normalizedLang.startsWith("zh")) {
        return "zh";
      }
      if (normalizedLang.startsWith("en")) {
        return "en";
      }
    }
  } catch (error) {
    console.warn("Error detecting language:", error);
  }
  
  return "en";
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get the correct language immediately
    const detectedLang = getInitialLanguage();
    setLanguageState(detectedLang);
    
    // Save to localStorage if it was detected from browser
    const savedLang = localStorage.getItem("language");
    if (!savedLang) {
      localStorage.setItem("language", detectedLang);
    }
    
    // Update HTML lang attribute
    const langMap = {
      "en": "en",
      "zh": "zh-CN", 
      "zh-TW": "zh-TW"
    };
    document.documentElement.lang = langMap[detectedLang];
    
    // Stop loading
    setIsLoading(false);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("language", lang);
    
    // Update HTML lang attribute for accessibility and SEO
    if (typeof document !== "undefined") {
      const langMap = {
        "en": "en",
        "zh": "zh-CN", 
        "zh-TW": "zh-TW"
      };
      document.documentElement.lang = langMap[lang];
    }
  };

  const t = (key: string): string => {
    const keys = key.split(".");
    let value: any = translations[language];
    
    for (const k of keys) {
      value = value?.[k];
    }
    
    return value || key;
  };

  // Show loading state to prevent flash
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isLoading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Translations
const translations = {
  en: {
    nav: {
      getStarted: "Get Started",
      signIn: "Sign In",
      signOut: "Sign Out",
      dashboard: "Dashboard"
    },
    hero: {
      title: "Track Your Habits,",
      titleHighlight: "Transform Your Life",
      subtitle: "Join betterr.me to build better habits, track your progress, and achieve your goals. Start your journey to self-improvement today."
    },
    features: {
      dailyTracking: {
        title: "Daily Tracking",
        description: "Easily track your habits daily with a simple, intuitive interface."
      },
      progressInsights: {
        title: "Progress Insights",
        description: "Visualize your progress with detailed statistics and insights."
      },
      stayMotivated: {
        title: "Stay Motivated",
        description: "Build streaks, earn achievements, and stay motivated on your journey."
      }
    },
    cta: {
      title: "Ready to Start Your Journey?",
      subtitle: "Join thousands of users who are already building better habits and transforming their lives.",
      button: "Get Started for Free"
    },
    dashboard: {
      welcome: "Welcome to your personal dashboard",
      profile: "Your Profile",
      email: "Email",
      accountCreated: "Account Created"
    }
  },
  zh: {
    nav: {
      getStarted: "开始使用",
      signIn: "登录",
      signOut: "退出",
      dashboard: "控制台"
    },
    hero: {
      title: "追踪你的习惯，",
      titleHighlight: "改变你的人生",
      subtitle: "加入 betterr.me，养成更好的习惯，追踪你的进步，实现你的目标。今天就开始你的自我提升之旅。"
    },
    features: {
      dailyTracking: {
        title: "每日追踪",
        description: "通过简单直观的界面，轻松追踪你的日常习惯。"
      },
      progressInsights: {
        title: "进度洞察",
        description: "通过详细的统计数据和洞察，可视化你的进步。"
      },
      stayMotivated: {
        title: "保持动力",
        description: "建立连续记录，获得成就，在旅程中保持动力。"
      }
    },
    cta: {
      title: "准备开始你的旅程了吗？",
      subtitle: "加入成千上万已经在养成更好习惯并改变生活的用户。",
      button: "免费开始"
    },
    dashboard: {
      welcome: "欢迎来到你的个人控制台",
      profile: "你的资料",
      email: "电子邮件",
      accountCreated: "账户创建时间"
    }
  },
  "zh-TW": {
    nav: {
      getStarted: "開始使用",
      signIn: "登入",
      signOut: "登出",
      dashboard: "控制台"
    },
    hero: {
      title: "追蹤你的習慣，",
      titleHighlight: "改變你的人生",
      subtitle: "加入 betterr.me，養成更好的習慣，追蹤你的進步，實現你的目標。今天就開始你的自我提升之旅。"
    },
    features: {
      dailyTracking: {
        title: "每日追蹤",
        description: "透過簡單直觀的介面，輕鬆追蹤你的日常習慣。"
      },
      progressInsights: {
        title: "進度洞察",
        description: "透過詳細的統計數據和洞察，視覺化你的進步。"
      },
      stayMotivated: {
        title: "保持動力",
        description: "建立連續記錄，獲得成就，在旅程中保持動力。"
      }
    },
    cta: {
      title: "準備開始你的旅程了嗎？",
      subtitle: "加入成千上萬已經在養成更好習慣並改變生活的用戶。",
      button: "免費開始"
    },
    dashboard: {
      welcome: "歡迎來到你的個人控制台",
      profile: "你的資料",
      email: "電子郵件",
      accountCreated: "帳戶創建時間"
    }
  }
}; 