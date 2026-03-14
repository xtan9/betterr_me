"use client";

import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AcceptState = "loading" | "success" | "error";

function AcceptInviteContent() {
  const t = useTranslations("money.household");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [result, setResult] = useState<{
    state: AcceptState;
    errorMessage: string;
  }>({ state: token ? "loading" : "error", errorMessage: token ? "" : "invalid" });

  useEffect(() => {
    if (!token) return;

    const accept = async () => {
      try {
        const res = await fetch("/api/money/household/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => null);
          const msg = err?.error || "Failed to accept invitation";
          setResult({ state: "error", errorMessage: msg });
          return;
        }

        setResult({ state: "success", errorMessage: "" });
      } catch {
        setResult({ state: "error", errorMessage: "error" });
      }
    };

    accept();
  }, [token]);

  const state = result.state;
  const errorMessage =
    result.errorMessage === "invalid"
      ? t("acceptInvalid")
      : result.errorMessage === "error"
        ? t("acceptError")
        : result.errorMessage.includes("expired")
          ? t("acceptExpired")
          : result.errorMessage;

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>{t("acceptTitle")}</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col items-center gap-4 text-center">
          {state === "loading" && (
            <>
              <Loader2 className="size-10 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("acceptProcessing")}
              </p>
            </>
          )}

          {state === "success" && (
            <>
              <CheckCircle2 className="size-10 text-green-600 dark:text-green-400" />
              <p className="text-sm font-medium">{t("acceptSuccess")}</p>
              <Button asChild>
                <Link href="/money">{t("acceptGoToMoney")}</Link>
              </Button>
            </>
          )}

          {state === "error" && (
            <>
              <XCircle className="size-10 text-destructive" />
              <p className="text-sm font-medium text-destructive">
                {errorMessage}
              </p>
              <Button variant="outline" asChild>
                <Link href="/money">{t("acceptGoToMoney")}</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Invite acceptance page at /money/invite/accept?token=...
 * Wrapped in Suspense for SSR compatibility with useSearchParams.
 */
export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteContent />
    </Suspense>
  );
}
