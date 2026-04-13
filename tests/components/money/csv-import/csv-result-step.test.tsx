import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { CsvResultStep } from "@/components/money/csv-import/csv-result-step";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

describe("CsvResultStep", () => {
  const baseProps = {
    onClose: vi.fn(),
    onBack: vi.fn(),
  };

  it("renders loading state while isImporting=true", () => {
    render(
      <CsvResultStep {...baseProps} isImporting={true} importResult={null} />,
    );

    expect(screen.getByText("importing")).toBeInTheDocument();
    // No buttons shown during importing
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders success state with imported count and no duplicate line when 0 duplicates", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CsvResultStep
        {...baseProps}
        onClose={onClose}
        isImporting={false}
        importResult={{ imported: 12, duplicates_skipped: 0 }}
      />,
    );

    expect(
      screen.getByText(/importSuccess:.*"count":12/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/duplicatesSkipped/)).not.toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "back" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders partial-success state with duplicates skipped line", () => {
    render(
      <CsvResultStep
        {...baseProps}
        isImporting={false}
        importResult={{ imported: 8, duplicates_skipped: 3 }}
      />,
    );

    expect(
      screen.getByText(/importSuccess:.*"count":8/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/duplicatesSkipped:.*"count":3/),
    ).toBeInTheDocument();
  });

  it("renders zero-imported edge case (0 imported, 0 duplicates)", () => {
    render(
      <CsvResultStep
        {...baseProps}
        isImporting={false}
        importResult={{ imported: 0, duplicates_skipped: 0 }}
      />,
    );

    expect(
      screen.getByText(/importSuccess:.*"count":0/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/duplicatesSkipped/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "back" })).toBeInTheDocument();
  });

  it("renders error state when not importing and no importResult", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <CsvResultStep
        {...baseProps}
        onBack={onBack}
        isImporting={false}
        importResult={null}
      />,
    );

    expect(screen.getByText("importError")).toBeInTheDocument();
    const backBtn = screen.getByRole("button", { name: "back" });
    await user.click(backBtn);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("does not fire onBack in success state when back button clicked (fires onClose)", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const onClose = vi.fn();
    render(
      <CsvResultStep
        isImporting={false}
        importResult={{ imported: 5, duplicates_skipped: 0 }}
        onBack={onBack}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("has no accessibility violations in success state", async () => {
    const { container } = render(
      <CsvResultStep
        {...baseProps}
        isImporting={false}
        importResult={{ imported: 5, duplicates_skipped: 2 }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("has no accessibility violations in error state", async () => {
    const { container } = render(
      <CsvResultStep {...baseProps} isImporting={false} importResult={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
