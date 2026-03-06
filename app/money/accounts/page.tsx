import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { AccountsList } from "@/components/money/accounts-list";

export default async function AccountsPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("accounts.title")} />
      <AccountsList />
    </div>
  );
}
