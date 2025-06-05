import Link from "next/link";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeSwitcher } from "./theme-switcher";
import { AuthButton } from "./auth-button";

export default async function Navbar() {
  return (
    <nav className="w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-2">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <Link href="/" prefetch className="text-xl font-bold text-blue-600">
          BetterR.me
        </Link>
        <div className="flex gap-4 items-center">
          <AuthButton />
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </nav>
  );
} 