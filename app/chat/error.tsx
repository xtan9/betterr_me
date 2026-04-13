"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import { log } from "@/lib/logger";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error("[chat] Rendering error", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-var(--header-height,56px))] gap-4 p-8">
      <AlertCircle className="h-10 w-10 text-destructive" />
      <h2 className="text-section-heading">Something went wrong</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        An unexpected error occurred while loading the chat. Please try again.
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
