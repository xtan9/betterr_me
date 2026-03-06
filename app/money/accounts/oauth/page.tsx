"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function OAuthRedirectPage() {
  const t = useTranslations("money");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [linkToken, setLinkToken] = useState<string | null>(null);

  const oauthStateId = searchParams.get("oauth_state_id");

  // If no oauth_state_id, redirect to accounts page
  useEffect(() => {
    if (!oauthStateId) {
      router.replace("/money/accounts");
    }
  }, [oauthStateId, router]);

  // Fetch a new link token for OAuth re-initialization
  useEffect(() => {
    if (!oauthStateId) return;

    let cancelled = false;

    async function fetchLinkToken() {
      try {
        const res = await fetch("/api/money/plaid/create-link-token", {
          method: "POST",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error || "Failed to create link token");
        }
        const data = await res.json();
        if (!cancelled) {
          setLinkToken(data.link_token);
        }
      } catch (error) {
        console.error("Failed to fetch link token for OAuth:", error);
        if (!cancelled) {
          toast.error(t("plaid.tokenError"));
          router.replace("/money/accounts");
        }
      }
    }

    fetchLinkToken();
    return () => {
      cancelled = true;
    };
  }, [oauthStateId, router, t]);

  const onSuccess = async (publicToken: string) => {
    try {
      const res = await fetch("/api/money/plaid/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_token: publicToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to exchange token");
      }
      toast.success(t("plaid.connectSuccess"));
    } catch (error) {
      console.error("OAuth token exchange error:", error);
      toast.error(t("plaid.exchangeError"));
    } finally {
      router.replace("/money/accounts");
    }
  };

  const onExit = (err: unknown) => {
    if (err) {
      console.error("Plaid Link OAuth error:", err);
      toast.error(t("plaid.linkError"));
    }
    router.replace("/money/accounts");
  };

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    receivedRedirectUri: typeof window !== "undefined" ? window.location.href : undefined,
  });

  // Auto-open Plaid Link when ready
  useEffect(() => {
    if (ready && linkToken) {
      open();
    }
  }, [ready, linkToken, open]);

  if (!oauthStateId) {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Loader2 className="mb-4 size-8 animate-spin text-money-sage" />
      <p className="text-sm text-muted-foreground">
        {t("plaid.connecting")}
      </p>
    </div>
  );
}
