"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { UserMinus, LogOut, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type {
  HouseholdMemberWithProfile,
  HouseholdInvitation,
} from "@/lib/db/types";

interface HouseholdMembersListProps {
  members: HouseholdMemberWithProfile[];
  invitations: HouseholdInvitation[];
  isOwner: boolean;
  currentUserId: string | null;
  onMutate: () => void;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return email[0].toUpperCase();
}

export function HouseholdMembersList({
  members,
  invitations,
  isOwner,
  currentUserId,
  onMutate,
}: HouseholdMembersListProps) {
  const t = useTranslations("money.household");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleRemoveMember = async (memberId: string) => {
    setLoadingId(memberId);
    try {
      const res = await fetch(`/api/money/household/members/${memberId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to remove member");
      }
      toast.success("Member removed");
      onMutate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove member";
      toast.error(message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleLeave = async () => {
    setLoadingId("leave");
    try {
      const res = await fetch("/api/money/household/leave", {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to leave household");
      }
      toast.success("Left household");
      onMutate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to leave household";
      toast.error(message);
    } finally {
      setLoadingId(null);
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    setLoadingId(invitationId);
    try {
      const res = await fetch(`/api/money/household/invite?id=${invitationId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to revoke invitation");
      }
      toast.success("Invitation revoked");
      onMutate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to revoke invitation";
      toast.error(message);
    } finally {
      setLoadingId(null);
    }
  };

  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  return (
    <div className="space-y-4">
      {/* Member list */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">
          {t("members")}
        </h4>
        <div className="space-y-2">
          {members.map((member) => {
            const isCurrentUser = member.user_id === currentUserId;
            return (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-money-border bg-money-surface px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarImage src={member.avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {getInitials(member.full_name, member.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {member.full_name || member.email}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs text-muted-foreground">
                          {t("memberYou")}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {member.role === "owner"
                      ? t("memberOwner")
                      : t("memberMember")}
                  </Badge>
                  {isOwner && !isCurrentUser && member.role !== "owner" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={loadingId === member.id}
                        >
                          <UserMinus className="size-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("memberRemove")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("memberRemoveConfirm")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleRemoveMember(member.id)}
                          >
                            {t("memberRemove")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending invitations */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">
            {t("invitePending")}
          </h4>
          <div className="space-y-2">
            {pendingInvitations.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-lg border border-dashed border-money-border px-4 py-3"
              >
                <div>
                  <span className="text-sm">{invite.email}</span>
                  <p className="text-xs text-muted-foreground">
                    {t("inviteExpires")}
                  </p>
                </div>
                {isOwner && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={loadingId === invite.id}
                      >
                        <XCircle className="mr-1 size-4 text-destructive" />
                        {t("inviteRevoke")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("inviteRevoke")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("inviteRevokeConfirm")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleRevokeInvite(invite.id)}
                        >
                          {t("inviteRevoke")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leave household button (for non-owner members) */}
      {!isOwner && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={loadingId === "leave"}
            >
              <LogOut className="mr-2 size-4" />
              {t("memberLeave")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("memberLeave")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("memberLeaveConfirm")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLeave}>
                {t("memberLeave")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
