"use client";

import { useAccounts } from "@/lib/hooks/use-accounts";
import { useTranslations } from "next-intl";
import { GoalCreateEditDialog } from "./goal-create-edit-dialog";
import { ContributeDialog } from "./contribute-dialog";
import type { GoalWithProjection } from "@/lib/db/types";

interface GoalFormProps {
  mode: "create" | "edit" | "contribute";
  goal?: GoalWithProjection | null;
  contributeGoalId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GoalForm({
  mode,
  goal,
  contributeGoalId,
  open,
  onOpenChange,
  onSuccess,
}: GoalFormProps) {
  const t = useTranslations("money.goals");
  const { connections } = useAccounts();

  const allAccounts = connections.flatMap((conn) =>
    conn.accounts.map((acc) => ({
      id: acc.id,
      name: `${conn.institution_name || t("unknownInstitution")} - ${acc.name}`,
      mask: acc.mask,
    })),
  );

  if (mode === "contribute") {
    return (
      <ContributeDialog
        goalId={contributeGoalId || ""}
        open={open}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <GoalCreateEditDialog
      mode={mode}
      goal={goal}
      accounts={allAccounts}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  );
}
