import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export type Locale = 'en' | 'zh' | 'zh-TW';

export const locales: Locale[] = ['en', 'zh', 'zh-TW'];
export const defaultLocale: Locale = 'en';

async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const headersList = await headers();
  
  // 1. Check saved preference in cookies first
  const savedLang = cookieStore.get("locale")?.value as Locale;
  if (savedLang && locales.includes(savedLang)) {
    return savedLang;
  }

  // 2. Check Accept-Language header
  const acceptLanguage = headersList.get("accept-language");
  if (acceptLanguage) {
    const languages = acceptLanguage.split(",").map(lang => lang.split(";")[0].trim());
    
    for (const lang of languages) {
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
  }
  
  return defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await getLocale();

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
}); 