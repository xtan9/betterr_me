import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArchivedProjectsContent } from "@/components/projects/archived-projects-content";

export async function generateMetadata() {
  const t = await getTranslations("projects.archived");
  return {
    title: t("title"),
  };
}

export default async function ArchivedProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return <ArchivedProjectsContent />;
}
