import {
  AuthPageShell,
  resolveAuthNext,
  type AuthPageSearchParams,
} from "@/components/auth/auth-page-shell";
import { SignUpForm } from "@/components/sign-up-form";

export default async function Page({ searchParams }: { searchParams: AuthPageSearchParams }) {
  const nextPath = await resolveAuthNext(searchParams);
  return (
    <AuthPageShell>
      <SignUpForm nextPath={nextPath} />
    </AuthPageShell>
  );
}
