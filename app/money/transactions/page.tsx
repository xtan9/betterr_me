import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { TransactionList } from "@/components/money/transaction-list";

export default async function TransactionsPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <PageHeader title={t("transactions.title")} />
      <Suspense>
        <TransactionList />
      </Suspense>
    </div>
  );
}
