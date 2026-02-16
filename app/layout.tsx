import type { Metadata } from "next";
import { Inter, Lexend } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "BetterR.me - Be a Little Better Every Day",
  description: "Be a better version of yourself every day. Track your habits, build consistency, and transform your life one small step at a time with BetterR.me",
};

const inter = Inter({
  variable: "--font-sans",
  display: "swap",
  subsets: ["latin"],
});

const lexend = Lexend({
  variable: "--font-display",
  display: "swap",
  subsets: ["latin"],
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  
  // Set the HTML lang attribute based on detected language
  const langMap = {
    "en": "en",
    "zh": "zh-CN", 
    "zh-TW": "zh-TW"
  };

  return (
    <html lang={langMap[locale as keyof typeof langMap]} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
      </head>
      <body className={`${inter.className} ${lexend.variable} antialiased`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            storageKey="betterr-theme"
            disableTransitionOnChange
          >
            {children}
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
