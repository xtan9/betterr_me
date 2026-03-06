import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { MoneyPageShell } from "@/components/money/money-page-shell";

export default async function MoneyPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("page.title")} subtitle={t("page.subtitle")} />
      <MoneyPageShell />
    </div>
  );
}
