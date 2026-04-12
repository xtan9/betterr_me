import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GraduationNudgeBanner } from "@/components/habits/graduation-nudge-banner";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("GraduationNudgeBanner", () => {
  it("renders title, body, and both buttons", () => {
    render(
      <GraduationNudgeBanner
        habitId="h1"
        onGraduate={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText(/graduate.nudge_title/)).toBeInTheDocument();
    expect(screen.getByText(/graduate.nudge_body/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /graduate.nudge_cta/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /graduate.nudge_dismiss/ })).toBeInTheDocument();
  });

  it("calls onDismiss with the habit id when 'Not yet' clicked", () => {
    const onDismiss = vi.fn();
    render(
      <GraduationNudgeBanner habitId="h1" onGraduate={vi.fn()} onDismiss={onDismiss} />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /graduate.nudge_dismiss/ })
    );
    expect(onDismiss).toHaveBeenCalledWith("h1");
  });

  it("calls onGraduate with the habit id when CTA clicked", () => {
    const onGraduate = vi.fn();
    render(
      <GraduationNudgeBanner habitId="h1" onGraduate={onGraduate} onDismiss={vi.fn()} />
    );
    fireEvent.click(
      screen.getByRole("button", { name: /graduate.nudge_cta/ })
    );
    expect(onGraduate).toHaveBeenCalledWith("h1");
  });
});
