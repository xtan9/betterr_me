import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { CardHeaderWithActions } from "@/components/shared/card-header-with-actions";

expect.extend(matchers);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("lucide-react", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    ChevronRight: (props: Record<string, unknown>) => (
      <span data-testid="icon-chevron" {...props} />
    ),
  };
});

describe("CardHeaderWithActions", () => {
  it("renders the title in an h2", () => {
    render(<CardHeaderWithActions title="My Section" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveTextContent("My Section");
  });

  it("applies font-display and text-section-heading to the title", () => {
    render(<CardHeaderWithActions title="My Section" />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveClass("font-display");
    expect(heading).toHaveClass("text-section-heading");
  });

  it("renders a plain heading when href is not provided", () => {
    render(<CardHeaderWithActions title="Plain" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("icon-chevron")).not.toBeInTheDocument();
  });

  it("wraps the title in a link when href is provided", () => {
    render(<CardHeaderWithActions title="Linked" href="/tasks" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/tasks");
    expect(link).toHaveTextContent("Linked");
  });

  it("shows the hover chevron only when href is provided", () => {
    render(<CardHeaderWithActions title="Linked" href="/tasks" />);
    expect(screen.getByTestId("icon-chevron")).toBeInTheDocument();
  });

  it("applies the group class on the link so group-hover reveals the chevron", () => {
    render(<CardHeaderWithActions title="Linked" href="/tasks" />);
    const link = screen.getByRole("link");
    expect(link).toHaveClass("group");
  });

  it("applies hover-reveal and reduced-motion classes on the chevron", () => {
    render(<CardHeaderWithActions title="Linked" href="/tasks" />);
    const chevron = screen.getByTestId("icon-chevron");
    expect(chevron).toHaveClass("opacity-0");
    expect(chevron).toHaveClass("group-hover:opacity-100");
    expect(chevron).toHaveClass("transition-opacity");
    expect(chevron).toHaveClass("motion-reduce:transition-none");
  });

  it("renders the actions slot", () => {
    render(
      <CardHeaderWithActions
        title="With Actions"
        actions={<button type="button">Add</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("renders both link title and actions together", () => {
    render(
      <CardHeaderWithActions
        title="Tasks"
        href="/tasks"
        actions={<button type="button">Add Task</button>}
      />
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/tasks");
    expect(
      screen.getByRole("button", { name: "Add Task" })
    ).toBeInTheDocument();
  });

  it("applies the shared layout classes on the card header", () => {
    const { container } = render(<CardHeaderWithActions title="Hello" />);
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header).toHaveClass("flex");
    expect(header).toHaveClass("flex-row");
    expect(header).toHaveClass("items-center");
    expect(header).toHaveClass("justify-between");
    expect(header).toHaveClass("space-y-0");
    expect(header).toHaveClass("pb-4");
  });

  it("merges caller className onto the card header", () => {
    const { container } = render(
      <CardHeaderWithActions title="Hello" className="custom-class" />
    );
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header).toHaveClass("custom-class");
  });

  it("has no accessibility violations with link + actions", async () => {
    const { container } = render(
      <CardHeaderWithActions
        title="Tasks"
        href="/tasks"
        actions={<button type="button">Add</button>}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
