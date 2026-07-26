import { AuthBranding } from "@/components/auth-branding";
import { LoginForm } from "@/components/login-form";
import { getSafeRedirectPath } from "@/lib/auth/redirect";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const requestedNext = (await searchParams).next ?? null;
  const nextPath = requestedNext ? getSafeRedirectPath(requestedNext) : "/dashboard";
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <AuthBranding />
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
