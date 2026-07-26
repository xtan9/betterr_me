"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ControlPlaneError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center"><AlertTriangle className="size-8 text-destructive" /><h1 className="text-section-heading">Couldn’t load Control Plane</h1><p className="max-w-sm text-body text-muted-foreground">Try again to load your current workspace data.</p><Button onClick={reset}>Try again</Button></main>;
}
