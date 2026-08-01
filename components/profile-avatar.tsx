"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { User as UserIcon } from "lucide-react";
import { ProfileAvatarClient } from "./profile-avatar-client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

export function ProfileAvatar() {
  const t = useTranslations("common.nav");
  const { currentProfile, isAuthenticated, status } = useCurrentProfile();

  if (
    !isAuthenticated ||
    status !== "available" ||
    !currentProfile
  ) {
    return null;
  }

  const email = currentProfile.identity.email ?? "User";
  const displayName =
    currentProfile.profileDetails.fullName || email.split("@")[0] || "User";
  const getInitials = (value: string) => {
    return value
      .split('@')[0]
      .split('.')
      .map(name => name.charAt(0).toUpperCase())
      .join('')
      .slice(0, 2);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-pill">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={currentProfile.profileDetails.avatarUrl ?? undefined}
              alt={displayName}
            />
            <AvatarFallback>{getInitials(email)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-1">
            <p className="text-body font-medium leading-none">{displayName}</p>
            <p className="text-caption leading-none text-muted-foreground">
              {currentProfile.identity.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings">
            <UserIcon className="mr-2 h-4 w-4" />
            <span>{t("profile")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ProfileAvatarClient />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
