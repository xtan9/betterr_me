"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Home,
  ClipboardList,
  ListChecks,
  PanelLeftClose,
  PanelLeft,
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

const mainNavItems = [
  {
    href: "/dashboard",
    icon: Home,
    labelKey: "dashboard",
    match: (p: string) => p === "/dashboard",
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
];

interface AppSidebarProps {
  pinned?: boolean;
  onTogglePin?: () => void;
}

const formatBadge = (count: number) => (count > 9 ? "9+" : String(count));

function NavIconContainer({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-sidebar-icon-bg">
      <Icon className="size-3.5" />
    </div>
  );
}

/** Chameleon-matched nav item class overrides */
const navButtonClassName = [
  // Size & spacing
  "h-9 rounded-xl font-semibold text-sm",
  // Transition
  "transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
  // Hover state (teal tint + inset ring)
  "hover:bg-sidebar-hover-bg hover:text-sidebar-hover-text hover:shadow-[inset_0_0_0_0.5px_hsl(var(--sidebar-hover-ring))]",
  // Active state (blue-gray + inset ring)
  "data-[active=true]:bg-sidebar-active-bg data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_0.5px_hsl(var(--sidebar-active-ring))] data-[active=true]:font-semibold",
].join(" ");

/** Asymmetric Chameleon padding (6px 12px 6px 6px) */
const navButtonStyle = { padding: "6px 12px 6px 6px" };

export function AppSidebar({ pinned, onTogglePin }: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  const tSidebar = useTranslations("common.sidebar");
  const { habitsIncomplete, tasksDue, error } = useSidebarCounts();

  const badgeCounts: Record<string, number> = error
    ? {}
    : { habits: habitsIncomplete, tasks: tasksDue };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <span className="font-display font-bold text-sm">B</span>
          </div>
          <span className="font-display font-semibold text-sm text-sidebar-foreground truncate group-data-[collapsible=icon]:hidden">
            BetterR.me
          </span>
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
                      className="inline-flex size-8 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserFooter />
      </SidebarFooter>
    </Sidebar>
  );
}
