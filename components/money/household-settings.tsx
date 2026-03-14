"use client";

import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/lib/hooks/use-household";
import { HouseholdMembersList } from "@/components/money/household-members-list";
import { HouseholdInviteDialog } from "@/components/money/household-invite-dialog";

/**
 * Household settings panel embedded in the money settings page.
 * Shows member list, pending invitations, and invite button (owner only).
 */
export function HouseholdSettings() {
  const t = useTranslations("money.household");
  const {
    members,
    invitations,
    isOwner,
    isLoading,
    mutate,
    userId,
  } = useHousehold();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">{t("settings")}</CardTitle>
            <span className="text-sm text-muted-foreground">
              ({members.length})
            </span>
          </div>
          {isOwner && (
            <HouseholdInviteDialog
              onSuccess={() => mutate()}
            />
          )}
        </div>
      </CardHeader>

      <CardContent>
        <HouseholdMembersList
          members={members}
          invitations={invitations}
          isOwner={isOwner}
          currentUserId={userId}
          onMutate={() => mutate()}
        />
      </CardContent>
    </Card>
  );
}
