import { ProfileAvatar } from "@/components/profile-avatar";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MainNav } from "@/components/main-nav";
import Link from "next/link";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center max-w-screen-2xl mx-auto px-4">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="font-bold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                BetterR.me
              </div>
            </Link>
            <MainNav />
          </div>

          {/* Right side navigation */}
          <div className="flex flex-1 items-center justify-end space-x-4">
            <nav className="flex items-center space-x-2">
              <LanguageSwitcher />
              <ThemeSwitcher />
              <ProfileAvatar />
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1">
        <div className="container max-w-screen-2xl mx-auto px-4 py-6">
          {children}
        </div>
      </div>
    </main>
  );
}
