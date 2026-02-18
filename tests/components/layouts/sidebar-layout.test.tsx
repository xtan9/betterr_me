import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SidebarLayout } from "@/components/layouts/sidebar-layout";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sidebar UI components as pass-through wrappers
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children, open }: any) => (
    <div data-testid="sidebar-provider" data-open={open}>
      {children}
    </div>
  ),
  SidebarInset: ({ children }: any) => (
    <div data-testid="sidebar-inset">{children}</div>
  ),
  SidebarTrigger: (props: any) => (
    <button data-testid="sidebar-trigger" {...props} />
  ),
}));

// Mock AppSidebar to capture props
const mockOnTogglePin = vi.fn();
const mockOnDropdownOpenChange = vi.fn();
vi.mock("@/components/layouts/app-sidebar", () => ({
  AppSidebar: ({ pinned, onTogglePin, onDropdownOpenChange }: any) => {
    // Store the callbacks so tests can invoke them
    mockOnTogglePin.mockImplementation(onTogglePin);
    mockOnDropdownOpenChange.mockImplementation(onDropdownOpenChange);
    return (
      <div
        data-testid="app-sidebar"
        data-pinned={pinned}
      />
    );
  },
}));

describe("SidebarLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset cookie state
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "",
    });
  });

  it("renders children inside sidebar provider", () => {
    render(
      <SidebarLayout defaultPinned={true}>
        <div data-testid="child-content">Hello</div>
      </SidebarLayout>
    );

    expect(screen.getByTestId("sidebar-provider")).toBeInTheDocument();
    expect(screen.getByTestId("child-content")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("handleTogglePin toggles pinned state and writes sidebar_pinned cookie", () => {
    render(
      <SidebarLayout defaultPinned={true}>
        <div>Content</div>
      </SidebarLayout>
    );

    // Initially pinned
    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-pinned",
      "true"
    );

    // Toggle pin (unpin)
    act(() => { mockOnTogglePin(); });

    expect(screen.getByTestId("app-sidebar")).toHaveAttribute(
      "data-pinned",
      "false"
    );
    expect(document.cookie).toContain("sidebar_pinned=false");
  });

  it("unpinning resets hover state (sidebar closes)", () => {
    render(
      <SidebarLayout defaultPinned={true}>
        <div>Content</div>
      </SidebarLayout>
    );

    // Initially pinned → open
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "true"
    );

    // Unpin
    act(() => { mockOnTogglePin(); });

    // After unpinning, hoverOpen was reset to false, so open = false || false = false
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "false"
    );
  });

  it("mouse enter/leave opens/closes sidebar when unpinned", () => {
    render(
      <SidebarLayout defaultPinned={false}>
        <div>Content</div>
      </SidebarLayout>
    );

    // The hover wrapper is the parent of AppSidebar
    const hoverWrapper = screen.getByTestId("app-sidebar").parentElement!;

    // Initially closed (unpinned, not hovering)
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "false"
    );

    // Mouse enter → opens
    fireEvent.mouseEnter(hoverWrapper);
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "true"
    );

    // Mouse leave → closes
    fireEvent.mouseLeave(hoverWrapper);
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "false"
    );
  });

  it("dropdown open keeps sidebar open when unpinned and not hovered", () => {
    render(
      <SidebarLayout defaultPinned={false}>
        <div>Content</div>
      </SidebarLayout>
    );

    // Initially closed (unpinned, not hovering)
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "false"
    );

    // Open dropdown → sidebar opens
    act(() => { mockOnDropdownOpenChange(true); });
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "true"
    );
  });

  it("dropdown close allows sidebar to close when unpinned and not hovered", () => {
    render(
      <SidebarLayout defaultPinned={false}>
        <div>Content</div>
      </SidebarLayout>
    );

    // Open dropdown
    act(() => { mockOnDropdownOpenChange(true); });
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "true"
    );

    // Close dropdown → sidebar closes (not pinned, not hovered)
    act(() => { mockOnDropdownOpenChange(false); });
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "false"
    );
  });

  it("mouse enter/leave has no effect when pinned", () => {
    render(
      <SidebarLayout defaultPinned={true}>
        <div>Content</div>
      </SidebarLayout>
    );

    const hoverWrapper = screen.getByTestId("app-sidebar").parentElement!;

    // Initially open (pinned)
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "true"
    );

    // Mouse enter → still open (pinned)
    fireEvent.mouseEnter(hoverWrapper);
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "true"
    );

    // Mouse leave → still open (pinned)
    fireEvent.mouseLeave(hoverWrapper);
    expect(screen.getByTestId("sidebar-provider")).toHaveAttribute(
      "data-open",
      "true"
    );
  });
});
