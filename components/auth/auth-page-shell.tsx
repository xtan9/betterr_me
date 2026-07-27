import type { ReactNode } from "react";
import { AuthBranding } from "@/components/auth-branding";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

export type AuthPageSearchParams = Promise<{ next?: string }>;

export async function resolveAuthNext(searchParams: AuthPageSearchParams) {
  const requestedNext = (await searchParams).next ?? null;
  return requestedNext ? getSafeRedirectPath(requestedNext) : "/dashboard";
}

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <AuthBranding />
        {children}
      </div>
    </div>
  );
}
