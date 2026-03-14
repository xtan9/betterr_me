import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { BudgetRing } from "@/components/money/budget-ring";

expect.extend(matchers);

// Mock cn utility
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

describe("BudgetRing", () => {
  it("renders SVG element with correct default size", () => {
    const { container } = render(<BudgetRing percent={50} />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute("width")).toBe("48");
    expect(svg!.getAttribute("height")).toBe("48");
  });

  it("shows sage color for 0-74% (e.g., 50%)", () => {
    const { container } = render(<BudgetRing percent={50} />);

    const circles = container.querySelectorAll("circle");
    // Second circle is the progress arc
    const progressCircle = circles[1];
    expect(progressCircle.getAttribute("stroke")).toBe(
      "hsl(var(--money-sage))"
    );
  });

  it("shows amber color for 75-89% (e.g., 80%)", () => {
    const { container } = render(<BudgetRing percent={80} />);

    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle.getAttribute("stroke")).toBe(
      "hsl(var(--money-amber))"
    );
  });

  it("shows caution color for 90%+ (e.g., 95%)", () => {
    const { container } = render(<BudgetRing percent={95} />);

    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle.getAttribute("stroke")).toBe(
      "hsl(var(--money-caution))"
    );
  });

  it("shows caution color for over 100% (e.g., 120%) - ring fully filled", () => {
    const { container } = render(<BudgetRing percent={120} />);

    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    // Over 100 still gets caution color
    expect(progressCircle.getAttribute("stroke")).toBe(
      "hsl(var(--money-caution))"
    );

    // Arc is clamped to 100% (strokeDashoffset should be 0, meaning full ring)
    const offset = parseFloat(
      progressCircle.getAttribute("stroke-dashoffset") || "0"
    );
    // At 100% clamped, offset should be 0 (full ring)
    expect(offset).toBeCloseTo(0, 1);
  });

  it("handles 0% correctly (no progress arc visible)", () => {
    const { container } = render(<BudgetRing percent={0} />);

    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];

    // At 0%, strokeDashoffset equals full circumference (no visible arc)
    const radius = (48 - 4) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = parseFloat(
      progressCircle.getAttribute("stroke-dashoffset") || "0"
    );
    expect(offset).toBeCloseTo(circumference, 1);
  });

  it("handles exactly 100% (full ring)", () => {
    const { container } = render(<BudgetRing percent={100} />);

    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];

    // At 100%, strokeDashoffset should be 0 (full ring)
    const offset = parseFloat(
      progressCircle.getAttribute("stroke-dashoffset") || "0"
    );
    expect(offset).toBeCloseTo(0, 1);
  });

  it("accepts custom color override", () => {
    const customColor = "#ff0000";
    const { container } = render(
      <BudgetRing percent={50} color={customColor} />
    );

    const circles = container.querySelectorAll("circle");
    const progressCircle = circles[1];
    expect(progressCircle.getAttribute("stroke")).toBe(customColor);
  });

  it("accepts custom size and strokeWidth", () => {
    const { container } = render(
      <BudgetRing percent={50} size={80} strokeWidth={6} />
    );

    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("80");
    expect(svg!.getAttribute("height")).toBe("80");

    const circles = container.querySelectorAll("circle");
    // Background track
    expect(circles[0].getAttribute("stroke-width")).toBe("6");
    // Progress arc
    expect(circles[1].getAttribute("stroke-width")).toBe("6");

    // Verify correct radius calculation: (80 - 6) / 2 = 37
    expect(circles[0].getAttribute("r")).toBe("37");
    expect(circles[1].getAttribute("r")).toBe("37");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <BudgetRing percent={50} />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
