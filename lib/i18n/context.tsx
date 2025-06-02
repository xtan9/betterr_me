"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { Language, LanguageContextType } from "./types";
import { translations } from "./translations";
import { getInitialLanguage } from "./utils";

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

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
    const translation = translations[language];
    
    // Simple nested property access with type safety
    let result: unknown = translation;
    for (const k of keys) {
      if (result && typeof result === 'object' && k in result) {
        result = (result as Record<string, unknown>)[k];
      } else {
        return key; // Return key if path doesn't exist
      }
    }
    
    return typeof result === 'string' ? result : key;
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