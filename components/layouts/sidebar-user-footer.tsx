"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import {
  Settings,
  LogOut,
  Sun,
  Moon,
  Laptop,
  Languages,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { SIDEBAR_TRANSITION, SIDEBAR_HOVER } from "@/lib/sidebar-styles";
import { useProfileTheme } from "@/lib/hooks/use-profile-theme";

const locales = [
  { code: "en", name: "English" },
  { code: "zh", name: "\u7B80\u4F53\u4E2D\u6587" },
  { code: "zh-TW", name: "\u7E41\u9AD4\u4E2D\u6587" },
] as const;

function getInitials(fullName: string | null | undefined, email: string | null): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  return email?.[0]?.toUpperCase() ?? "?";
}

interface SidebarUserFooterProps {
  onDropdownOpenChange?: (open: boolean) => void;
}

export function SidebarUserFooter({ onDropdownOpenChange }: SidebarUserFooterProps) {
  const { data, error, status, theme, selectTheme } = useProfileTheme();
  const locale = useLocale();
  const t = useTranslations("common.nav");
  const tSidebar = useTranslations("common.sidebar");
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [, startTransition] = useTransition();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard hydration guard pattern
  useEffect(() => { setMounted(true); }, []);

  const currentProfile = data?.currentProfile;
  const profileDetails = currentProfile?.profileDetails;
  const displayEmail = currentProfile?.identity.email ?? "";
  const initials = currentProfile
    ? getInitials(profileDetails?.fullName, displayEmail)
    : "?";
  const displayName = profileDetails?.fullName || displayEmail;

  const handleLocaleChange = (code: string) => {
    startTransition(() => {
      document.cookie = `locale=${code}; path=/; max-age=31536000`;
      window.location.reload();
    });
  };

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/auth/login");
    } catch (err) {
      console.error("Sign out failed:", err);
      toast.error(tSidebar("signOutError"));
    }
  };

  if (status === "unavailable" || error) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <Avatar className="h-8 w-8 rounded-card">
              <AvatarFallback className="rounded-card">!</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-body leading-tight">
              <span className="truncate font-semibold text-destructive">
                {tSidebar("profileError")}
              </span>
              <span className="truncate text-caption text-muted-foreground">
                &nbsp;
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!data) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <Avatar className="h-8 w-8 rounded-card">
              <AvatarFallback className="rounded-card">?</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-body leading-tight">
              <span className="truncate font-semibold">{tSidebar("loading")}</span>
              <span className="truncate text-caption text-muted-foreground">
                &nbsp;
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={onDropdownOpenChange}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className={`${SIDEBAR_TRANSITION} ${SIDEBAR_HOVER} data-[state=open]:bg-sidebar-hover-bg data-[state=open]:text-sidebar-hover-text data-[state=open]:shadow-[inset_0_0_0_0.5px_hsl(var(--sidebar-hover-ring))] group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:justify-center`}
            >
              <Avatar className="h-8 w-8 rounded-card group-data-[collapsible=icon]:hidden">
                <AvatarImage
                  src={profileDetails?.avatarUrl ?? undefined}
                  alt={profileDetails?.fullName ?? ""}
                />
                <AvatarFallback className="rounded-card">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Settings className="hidden size-4 shrink-0 group-data-[collapsible=icon]:block" />
              <div className="grid flex-1 text-left text-body leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-caption text-muted-foreground">
                  {displayEmail}
                </span>
              </div>
              <Settings className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-card"
            side="top"
            align="start"
            sideOffset={8}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-body">
                <Avatar className="h-8 w-8 rounded-card">
                  <AvatarImage
                    src={profileDetails?.avatarUrl ?? undefined}
                    alt={profileDetails?.fullName ?? ""}
                  />
                  <AvatarFallback className="rounded-card">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-body leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-caption text-muted-foreground">
                    {displayEmail}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings">
                <Settings className="mr-2 size-4" />
                {t("settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {mounted && (
              <>
                <DropdownMenuLabel>{tSidebar("theme")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={selectTheme}
                >
                  <DropdownMenuRadioItem value="light">
                    <Sun className="mr-2 size-4" /> {tSidebar("themeLight")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <Moon className="mr-2 size-4" /> {tSidebar("themeDark")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system">
                    <Laptop className="mr-2 size-4" />{" "}
                    {tSidebar("themeSystem")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuLabel>{tSidebar("language")}</DropdownMenuLabel>
            {locales.map((item) => (
              <DropdownMenuItem
                key={item.code}
                onClick={() => handleLocaleChange(item.code)}
                className={locale === item.code ? "font-semibold" : ""}
              >
                <Languages className="mr-2 size-4" /> {item.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 size-4" />
              {tSidebar("logOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
