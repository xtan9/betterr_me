import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layouts/page-header";
import { TransactionList } from "@/components/money/transaction-list";
import { ExportTransactionsDialog } from "@/components/money/export-transactions-dialog";

export default async function TransactionsPage() {
  const t = await getTranslations("money");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t("transactions.title")} />
        <ExportTransactionsDialog />
      </div>
      <Suspense>
        <TransactionList />
      </Suspense>
    </div>
  );
}
