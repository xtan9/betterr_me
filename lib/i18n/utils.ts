import type { Language } from "./types";

// Helper function to detect language synchronously
export const getInitialLanguage = (): Language => {
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