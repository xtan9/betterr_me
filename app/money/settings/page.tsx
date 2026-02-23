import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { CategoryManager } from "@/components/money/category-manager";

export default async function MoneySettingsPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings.title")} />
      <CategoryManager />
    </div>
  );
}
