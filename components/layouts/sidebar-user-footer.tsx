"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { useTheme } from "next-themes";
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
import { fetcher } from "@/lib/fetcher";
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

interface ProfileData {
  profile: {
    full_name: string | null;
    avatar_url: string | null;
    email: string;
  };
}

const locales = [
  { code: "en", name: "English" },
  { code: "zh", name: "\u7B80\u4F53\u4E2D\u6587" },
  { code: "zh-TW", name: "\u7E41\u9AD4\u4E2D\u6587" },
] as const;

function getInitials(fullName: string | null | undefined, email: string): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0][0].toUpperCase();
  }
  return email[0].toUpperCase();
}

interface SidebarUserFooterProps {
  onDropdownOpenChange?: (open: boolean) => void;
}

export function SidebarUserFooter({ onDropdownOpenChange }: SidebarUserFooterProps) {
  const { data, error } = useSWR<ProfileData>("/api/profile", fetcher);
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const t = useTranslations("common.nav");
  const tSidebar = useTranslations("common.sidebar");
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [, startTransition] = useTransition();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard hydration guard pattern
  useEffect(() => { setMounted(true); }, []);

  const profile = data?.profile;
  const initials = profile ? getInitials(profile.full_name, profile.email) : "?";
  const displayName = profile?.full_name || profile?.email || "";
  const displayEmail = profile?.email || "";

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

  if (error) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback className="rounded-lg">!</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold text-destructive">
                {tSidebar("profileError")}
              </span>
              <span className="truncate text-xs text-muted-foreground">
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
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback className="rounded-lg">?</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{tSidebar("loading")}</span>
              <span className="truncate text-xs text-muted-foreground">
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
              className="transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text hover:shadow-[inset_0_0_0_0.5px_hsl(var(--sidebar-hover-ring))] data-[state=open]:bg-sidebar-hover-bg data-[state=open]:text-sidebar-hover-text data-[state=open]:shadow-[inset_0_0_0_0.5px_hsl(var(--sidebar-hover-ring))]"
            >
              <Avatar className="h-8 w-8 rounded-lg group-data-[collapsible=icon]:hidden">
                <AvatarImage
                  src={profile?.avatar_url ?? undefined}
                  alt={profile?.full_name ?? ""}
                />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <Settings className="hidden size-4 group-data-[collapsible=icon]:block" />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {displayEmail}
                </span>
              </div>
              <Settings className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-48 rounded-lg"
            side="top"
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage
                    src={profile?.avatar_url ?? undefined}
                    alt={profile?.full_name ?? ""}
                  />
                  <AvatarFallback className="rounded-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">
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
                  onValueChange={setTheme}
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
