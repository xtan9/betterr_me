import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { PageHeader } from "@/components/layouts/page-header";

expect.extend(matchers);

describe("PageHeader", () => {
  it("renders title as h1", () => {
    render(<PageHeader title="Test Title" />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Test Title");
  });

  it("renders subtitle when provided", () => {
    render(<PageHeader title="Title" subtitle="Sub text" />);

    expect(screen.getByText("Sub text")).toBeInTheDocument();
  });

  it("does not render subtitle when omitted", () => {
    render(<PageHeader title="Title" />);

    expect(screen.queryByText("Sub text")).not.toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(
      <PageHeader title="Title" actions={<button>Click</button>} />
    );

    expect(screen.getByRole("button", { name: "Click" })).toBeInTheDocument();
  });

  it("does not render actions container when omitted", () => {
    render(<PageHeader title="Title" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <PageHeader title="Title" className="custom-class" />
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <PageHeader title="Accessible Title" subtitle="Some subtitle" />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
