import {
  AuthPageShell,
  resolveAuthNext,
  type AuthPageSearchParams,
} from "@/components/auth/auth-page-shell";
import { LoginForm } from "@/components/login-form";

export default async function Page({ searchParams }: { searchParams: AuthPageSearchParams }) {
  const nextPath = await resolveAuthNext(searchParams);
  return (
    <AuthPageShell>
      <LoginForm nextPath={nextPath} />
    </AuthPageShell>
  );
}
