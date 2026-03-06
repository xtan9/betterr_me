"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { KeyedMutator } from "swr";
import type { AccountsResponse } from "@/lib/hooks/use-accounts";

interface PlaidLinkButtonProps {
  mutate?: KeyedMutator<AccountsResponse>;
  className?: string;
}

export function PlaidLinkButton({ mutate, className }: PlaidLinkButtonProps) {
  const t = useTranslations("money");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoadingToken, setIsLoadingToken] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);

  // Fetch link token on mount (run once only)
  useEffect(() => {
    let cancelled = false;

    async function fetchLinkToken() {
      setIsLoadingToken(true);
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
        console.error("Failed to fetch link token:", error);
      } finally {
        if (!cancelled) {
          setIsLoadingToken(false);
        }
      }
    }

    fetchLinkToken();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSuccess = useCallback(
    async (publicToken: string) => {
      setIsExchanging(true);
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
        mutate?.(undefined, { revalidate: false });
      } catch (error) {
        console.error("Token exchange error:", error);
        toast.error(t("plaid.exchangeError"));
      } finally {
        setIsExchanging(false);
      }
    },
    [mutate, t]
  );

  const onExit = useCallback(
    (err: unknown) => {
      if (err) {
        console.error("Plaid Link error:", err);
        toast.error(t("plaid.linkError"));
      }
    },
    [t]
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  const isDisabled = !ready || isLoadingToken || isExchanging;

  return (
    <Button
      onClick={() => open()}
      disabled={isDisabled}
      className={className}
    >
      {isLoadingToken || isExchanging ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Landmark className="size-4" />
      )}
      {isExchanging ? t("plaid.connecting") : t("plaid.connectBank")}
    </Button>
  );
}
