import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function ControlPlaneAccessDenied() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex flex-col items-center p-card-padding text-center">
          <div className="mb-4 flex size-10 items-center justify-center rounded-pill bg-muted text-muted-foreground"><Shield className="size-5" /></div>
          <h1 className="text-section-heading">Control Plane access required</h1>
          <p className="mt-2 text-body text-muted-foreground">Your BetterR account is not enabled for this workspace.</p>
          <Button asChild className="mt-6"><Link href="/dashboard">Return to dashboard</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
