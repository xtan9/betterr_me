"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Home, ClipboardList, ListChecks, PanelLeftClose, PanelLeft } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

const navItems = [
  {
    href: "/dashboard",
    icon: Home,
    labelKey: "dashboard",
    match: (p: string) => p === "/dashboard" || p === "/dashboard/settings",
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

export function AppSidebar({ pinned, onTogglePin }: AppSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  const tSidebar = useTranslations("common.sidebar");

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
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={item.match(pathname)}
                    tooltip={t(item.labelKey)}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{t(item.labelKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
