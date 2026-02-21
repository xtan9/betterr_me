"use client";

import React, { useState, useCallback } from "react";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layouts/app-sidebar";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

interface SidebarLayoutProps {
  defaultPinned: boolean;
  children: React.ReactNode;
}

export function SidebarLayout({ defaultPinned, children }: SidebarLayoutProps) {
  const [pinned, setPinned] = useState(defaultPinned);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const open = pinned || hoverOpen || dropdownOpen;

  const handleTogglePin = useCallback(() => {
    const newPinned = !pinned;
    setPinned(newPinned);
    document.cookie = `sidebar_pinned=${newPinned}; path=/; max-age=${COOKIE_MAX_AGE}`;
    if (!newPinned) {
      setHoverOpen(false);
    }
  }, [pinned]);

  const handleMouseEnter = useCallback(() => {
    if (!pinned) {
      setHoverOpen(true);
    }
  }, [pinned]);

  const handleMouseLeave = useCallback(() => {
    if (!pinned) {
      setHoverOpen(false);
    }
  }, [pinned]);

  // In controlled mode, onOpenChange is called by SidebarProvider internals.
  // For desktop, pin+hover manage the open state, so we ignore desktop changes.
  // For mobile, we let the sheet handle itself via the internal openMobile state.
  const handleOpenChange = useCallback(() => {
    // No-op for desktop -- pin button and hover manage state.
    // Mobile sheet uses its own openMobile state internally.
  }, []);

  return (
    <SidebarProvider
      open={open}
      onOpenChange={handleOpenChange}
      style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3.75rem" } as React.CSSProperties}
    >
      <div
        data-sidebar-hover={!pinned && hoverOpen ? "true" : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AppSidebar pinned={pinned} onTogglePin={handleTogglePin} onDropdownOpenChange={setDropdownOpen} />
      </div>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger className="-ml-1" />
          <span className="font-display font-bold text-lg text-primary">
            BetterR.me
          </span>
        </header>
        <div className="flex-1 overflow-auto bg-background">
          <div className="w-full px-4 py-6 sm:px-6 md:px-8 md:pt-10">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
