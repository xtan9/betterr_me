"use client";

import Link from "next/link";
import { Button } from "./ui/button";
import { LogoutButton } from "./logout-button";
import { useTranslations } from "next-intl";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

export function AuthButton() {
  const t = useTranslations("common.nav");
  const { currentProfile, isAuthenticated, status } = useCurrentProfile();

  if (status === "loading") {
    return <span aria-hidden="true" className="h-8 w-24" />;
  }

  if (isAuthenticated) {
    if (status !== "available" || !currentProfile) return null;

    return (
      <div className="flex items-center gap-4">
        <span className="text-body">{currentProfile.identity.email}</span>
        <LogoutButton />
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button asChild size="sm" variant="outline">
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
      <Button asChild size="sm" variant="default">
        <Link href="/auth/sign-up">{t("getStarted")}</Link>
      </Button>
    </div>
  );
}
