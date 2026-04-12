import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { CategoryManager } from "@/components/money/category-manager";
import { HouseholdSettings } from "@/components/money/household-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DeleteMoneyDataDialog } from "@/components/money/delete-money-data-dialog";

export default async function MoneySettingsPage() {
  const t = await getTranslations("money");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("settings.title")} />
      <HouseholdSettings />
      <CategoryManager />
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.dataManagement")}</CardTitle>
          <CardDescription>{t("deleteData.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteMoneyDataDialog />
        </CardContent>
      </Card>
    </div>
  );
}
