import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { Sparkles } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

expect.extend(matchers);

vi.mock("lucide-react", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    Sparkles: (props: Record<string, unknown>) => (
      <span data-testid="icon-sparkles" {...props} />
    ),
  };
});

describe("EmptyState", () => {
  it("renders title, description, and icon", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="Nothing yet"
        description="Add your first item to get started."
      />
    );

    expect(screen.getByText("Nothing yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add your first item to get started.")
    ).toBeInTheDocument();
    expect(screen.getByTestId("icon-sparkles")).toBeInTheDocument();
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("does not render an action slot when action prop is not provided", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="Nothing yet"
        description="Add an item."
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders action slot when provided", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="Nothing yet"
        description="Add an item."
        action={<button type="button">Create</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("wraps the action slot in an mt-6 spacer", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="Nothing yet"
        description="Add an item."
        action={<button type="button">Create</button>}
      />
    );
    const button = screen.getByRole("button", { name: "Create" });
    expect(button.parentElement).toHaveClass("mt-6");
  });

  it("applies celebration variant classes", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="All done"
        description="Enjoy the rest of your day."
        variant="celebration"
      />
    );
    const container = screen.getByTestId("empty-state");
    expect(container).toHaveClass("bg-gradient-to-b");
    expect(container).toHaveClass("rounded-card");
  });

  it("does not apply celebration classes in default variant", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="Nothing"
        description="Add an item."
      />
    );
    const container = screen.getByTestId("empty-state");
    expect(container).not.toHaveClass("bg-gradient-to-b");
  });

  it("applies custom icon background and color classes", () => {
    const { container } = render(
      <EmptyState
        icon={Sparkles}
        title="Nothing"
        description="Add."
        iconBgClass="bg-primary/10"
        iconColorClass="text-primary"
      />
    );
    const iconWrapper = container.querySelector(".rounded-pill");
    expect(iconWrapper).toHaveClass("bg-primary/10");
    const icon = screen.getByTestId("icon-sparkles");
    expect(icon).toHaveClass("text-primary");
  });

  it("falls back to bg-muted when iconBgClass is omitted", () => {
    const { container } = render(
      <EmptyState icon={Sparkles} title="Nothing" description="Add." />
    );
    const iconWrapper = container.querySelector(".rounded-pill");
    expect(iconWrapper).toHaveClass("bg-muted");
  });

  it("falls back to text-muted-foreground when iconColorClass is omitted", () => {
    render(<EmptyState icon={Sparkles} title="Nothing" description="Add." />);
    const icon = screen.getByTestId("icon-sparkles");
    expect(icon).toHaveClass("text-muted-foreground");
  });

  it("merges caller className onto the outer container", () => {
    render(
      <EmptyState
        icon={Sparkles}
        title="Nothing"
        description="Add."
        className="custom-class"
      />
    );
    expect(screen.getByTestId("empty-state")).toHaveClass("custom-class");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <EmptyState
        icon={Sparkles}
        title="Nothing yet"
        description="Add your first item."
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
