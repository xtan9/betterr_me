import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { MoneyPageShell } from "@/components/money/money-page-shell";

export default async function MoneyPage() {
  const t = await getTranslations("money");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("page.title")} subtitle={t("page.subtitle")} />
      <MoneyPageShell />
    </div>
  );
}
