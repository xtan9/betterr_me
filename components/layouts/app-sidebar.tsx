"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  ClipboardList,
  ListChecks,
  BookOpen,
  Dumbbell,
  CalendarDays,
  MessageSquare,
  ShieldCheck,
  PanelLeftClose,
  PanelLeft,
  Shield,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { SidebarUserFooter } from "@/components/layouts/sidebar-user-footer";
import { useSidebarCounts } from "@/lib/hooks/use-sidebar-counts";
import { SIDEBAR_TRANSITION, SIDEBAR_HOVER } from "@/lib/sidebar-styles";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

const mainNavItems = [
  {
    href: "/dashboard",
    icon: Home,
    labelKey: "dashboard",
    match: (p: string) => p === "/dashboard",
  },
  {
    href: "/finance/cushion",
    icon: ShieldCheck,
    labelKey: "finance",
    match: (p: string) => p.startsWith("/finance"),
  },
  {
    href: "/habits",
    icon: ClipboardList,
    labelKey: "habits",
    match: (p: string) => p.startsWith("/habits"),
  },
  {
    href: "/tasks",
    icon: ListChecks,
    labelKey: "tasks",
    match: (p: string) => p.startsWith("/tasks"),
  },
  {
    href: "/journal",
    icon: BookOpen,
    labelKey: "journal",
    match: (p: string) => p.startsWith("/journal"),
  },
  {
    href: "/workouts",
    icon: Dumbbell,
    labelKey: "workouts",
    match: (p: string) => p.startsWith("/workouts"),
  },
  {
    href: "/calendar",
    icon: CalendarDays,
    labelKey: "calendar",
    match: (p: string) => p.startsWith("/calendar"),
  },
  {
    href: "/chat",
    icon: MessageSquare,
    labelKey: "chat",
    match: (p: string) => p.startsWith("/chat"),
  },
];

interface AppSidebarProps {
  pinned?: boolean;
  onTogglePin?: () => void;
  onDropdownOpenChange?: (open: boolean) => void;
}

const formatBadge = (count: number) => (count > 9 ? "9+" : String(count));

function NavIconContainer({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-control bg-sidebar-icon-bg">
      <Icon className="size-3.5" />
    </div>
  );
}

/** Chameleon-matched nav item class overrides */
const navButtonClassName = [
  // Size & spacing (h-10 = 40px matches collapsed !size-10 for seamless transition)
  "h-10 rounded-control font-medium text-body",
  // Collapsed: enlarge button so 24px icon container fits (40px - 2*8px padding = 24px)
  "group-data-[collapsible=icon]:!size-10",
  // Transition + hover
  SIDEBAR_TRANSITION,
  SIDEBAR_HOVER,
  // Active state (blue-gray + inset ring)
  "data-[active=true]:bg-sidebar-active-bg data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_0.5px_hsl(var(--sidebar-active-ring))] data-[active=true]:font-semibold",
].join(" ");

/** Chameleon padding — 8px left matches collapsed centering (40px - 2*8px = 24px icon) */
const navButtonStyle = { padding: "8px 12px 8px 8px" };

export function AppSidebar({ pinned, onTogglePin, onDropdownOpenChange }: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  const tSidebar = useTranslations("common.sidebar");
  const { habitsIncomplete, tasksDue, error } = useSidebarCounts();
  const { data: profileData } = useSWR("/api/profile", fetcher, { keepPreviousData: true });
  const isAdmin = profileData?.profile?.role === "admin";

  const badgeCounts: Record<string, number> = error
    ? {}
    : { habits: habitsIncomplete, tasks: tasksDue };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="pt-5">
        <div className="flex h-8 items-center gap-2">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            <div className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-control bg-primary text-primary-foreground">
              <span className="font-display font-bold text-body">B</span>
            </div>
            <span className="font-display font-semibold text-body text-sidebar-foreground truncate group-data-[collapsible=icon]:hidden">
              BetterR.me
            </span>
          </Link>
          {onTogglePin && (
            <div className="ml-auto group-data-[collapsible=icon]:hidden">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onTogglePin}
                      aria-pressed={pinned}
                      aria-label={
                        pinned
                          ? tSidebar("unpinLabel")
                          : tSidebar("pinLabel")
                      }
                      className="inline-flex size-8 items-center justify-center rounded-control text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                    >
                      {pinned ? (
                        <PanelLeftClose className="size-4" />
                      ) : (
                        <PanelLeft className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {pinned ? tSidebar("unpin") : tSidebar("pin")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.match(pathname)}
                    tooltip={t(item.labelKey)}
                    className={navButtonClassName}
                    style={navButtonStyle}
                  >
                    <Link href={item.href}>
                      <NavIconContainer icon={item.icon} />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                  {badgeCounts[item.labelKey] > 0 && (
                    <SidebarMenuBadge>
                      {formatBadge(badgeCounts[item.labelKey])}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/dashboard/admin")}
                    tooltip={t("admin")}
                    className={navButtonClassName}
                    style={navButtonStyle}
                  >
                    <Link href="/dashboard/admin">
                      <NavIconContainer icon={Shield} />
                      <span>{t("admin")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserFooter onDropdownOpenChange={onDropdownOpenChange} />
      </SidebarFooter>
    </Sidebar>
  );
}
