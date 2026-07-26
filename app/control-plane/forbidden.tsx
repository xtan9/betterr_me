import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ControlPlaneForbidden() {
  return (
    <main className="container mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-8">
      <section className="w-full rounded-card border p-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">Access denied</p>
        <h1 className="mt-2 text-page-title tracking-tight">You don&apos;t have access to this page</h1>
        <p className="mt-3 text-body text-muted-foreground">
          If you believe this is an error, contact your administrator.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Return to dashboard</Link>
        </Button>
      </section>
    </main>
  );
}
