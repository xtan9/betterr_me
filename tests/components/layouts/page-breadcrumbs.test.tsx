import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock breadcrumb UI components
vi.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children, className }: any) => (
    <nav data-testid="breadcrumb" className={className}>
      {children}
    </nav>
  ),
  BreadcrumbList: ({ children }: any) => <ol>{children}</ol>,
  BreadcrumbItem: ({ children }: any) => <li>{children}</li>,
  BreadcrumbLink: ({ children, asChild }: any) => {
    if (asChild) return <>{children}</>;
    return <a>{children}</a>;
  },
  BreadcrumbSeparator: () => (
    <span data-testid="breadcrumb-separator">/</span>
  ),
  BreadcrumbPage: ({ children }: any) => (
    <span data-testid="breadcrumb-page">{children}</span>
  ),
}));

describe("PageBreadcrumbs", () => {
  it("renders section link with correct href for habits", () => {
    render(<PageBreadcrumbs section="habits" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/habits");
    expect(link).toHaveTextContent("habits");
  });

  it("renders section link with correct href for tasks", () => {
    render(<PageBreadcrumbs section="tasks" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/tasks");
    expect(link).toHaveTextContent("tasks");
  });

  it("renders section link with correct href for settings", () => {
    render(<PageBreadcrumbs section="settings" />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/dashboard/settings");
    expect(link).toHaveTextContent("settings");
  });

  it("renders item name when itemName prop is provided", () => {
    render(<PageBreadcrumbs section="habits" itemName="Morning Run" />);

    expect(screen.getByTestId("breadcrumb-page")).toHaveTextContent(
      "Morning Run"
    );
    expect(screen.getByTestId("breadcrumb-separator")).toBeInTheDocument();
  });

  it("does not render separator/item when itemName is omitted", () => {
    render(<PageBreadcrumbs section="habits" />);

    expect(screen.queryByTestId("breadcrumb-page")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("breadcrumb-separator")
    ).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<PageBreadcrumbs section="habits" className="my-custom-class" />);

    const nav = screen.getByTestId("breadcrumb");
    expect(nav.className).toContain("my-custom-class");
  });
});
