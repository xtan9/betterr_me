import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { AccountsList } from "@/components/money/accounts-list";

export default async function AccountsPage() {
  const t = await getTranslations("money");

  return (
    <div className="flex flex-col gap-section-gap">
      <PageHeader title={t("accounts.title")} />
      <AccountsList />
    </div>
  );
}
