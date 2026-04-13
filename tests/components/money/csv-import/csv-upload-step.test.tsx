import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { CsvUploadStep } from "@/components/money/csv-import/csv-upload-step";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const defaultAccounts = [
  { id: "acct-1", name: "Checking", mask: "1234" },
  { id: "acct-2", name: "Savings", mask: null },
];

function renderStep(overrides: Partial<React.ComponentProps<typeof CsvUploadStep>> = {}) {
  const props: React.ComponentProps<typeof CsvUploadStep> = {
    file: null,
    parseError: null,
    handleFileInputChange: vi.fn(),
    handleDrop: vi.fn(),
    handleDragOver: vi.fn(),
    flipSign: false,
    setFlipSign: vi.fn(),
    selectedAccountId: "cash",
    setSelectedAccountId: vi.fn(),
    allAccounts: defaultAccounts,
    ...overrides,
  };
  return { props, ...render(<CsvUploadStep {...props} />) };
}

describe("CsvUploadStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders drop zone label, drag-drop hint, and file input", () => {
    renderStep();

    expect(screen.getByText("selectFile")).toBeInTheDocument();
    expect(screen.getByText("dragDrop")).toBeInTheDocument();
    // File input is hidden but present in the DOM
    const fileInput = document.getElementById("csv-file-input") as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    expect(fileInput?.type).toBe("file");
    expect(fileInput?.accept).toBe(".csv,.tsv,.txt");
  });

  it("shows the file name when a file is provided", () => {
    const file = new File(["a,b,c"], "transactions.csv", { type: "text/csv" });
    renderStep({ file });
    expect(screen.getByText("transactions.csv")).toBeInTheDocument();
  });

  it("does not show a file name when file is null", () => {
    renderStep({ file: null });
    expect(screen.queryByText(/\.csv$/)).not.toBeInTheDocument();
  });

  it("renders parse error message when parseError is set", () => {
    renderStep({ parseError: "Bad CSV format" });
    expect(screen.getByText("Bad CSV format")).toBeInTheDocument();
  });

  it("does not render error when parseError is null", () => {
    renderStep({ parseError: null });
    expect(screen.queryByText("Bad CSV format")).not.toBeInTheDocument();
  });

  it("fires handleFileInputChange when a file is selected via input", async () => {
    const handleFileInputChange = vi.fn();
    renderStep({ handleFileInputChange });

    const fileInput = document.getElementById("csv-file-input") as HTMLInputElement;
    const file = new File(["date,amount\n2026-01-01,-5"], "t.csv", { type: "text/csv" });

    await userEvent.upload(fileInput, file);

    expect(handleFileInputChange).toHaveBeenCalledTimes(1);
  });

  it("toggles the flip-sign checkbox via setFlipSign", async () => {
    const setFlipSign = vi.fn();
    renderStep({ setFlipSign });

    const checkbox = screen.getByRole("checkbox", { name: /flipSign/i });
    await userEvent.click(checkbox);

    expect(setFlipSign).toHaveBeenCalledWith(true);
  });

  it("renders all provided accounts plus Cash option when select is opened", async () => {
    const setSelectedAccountId = vi.fn();
    renderStep({ setSelectedAccountId });

    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);

    // Options are rendered in a portal; use findByText and check each
    expect(await screen.findByRole("option", { name: "Cash" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Checking \(1234\)/ })
    ).toBeInTheDocument();
    // Savings has null mask → no parenthetical
    expect(screen.getByRole("option", { name: "Savings" })).toBeInTheDocument();
  });

  it("calls setSelectedAccountId when an account option is chosen", async () => {
    const setSelectedAccountId = vi.fn();
    renderStep({ setSelectedAccountId });

    await userEvent.click(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /Checking \(1234\)/ });
    await userEvent.click(option);

    expect(setSelectedAccountId).toHaveBeenCalledWith("acct-1");
  });

  it("renders flipSign help text", () => {
    renderStep();
    expect(screen.getByText("flipSignHelp")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderStep();
    // button-name is disabled because shadcn's SelectTrigger exposes an
    // empty accessible name until opened (Radix known behavior).
    expect(
      await axe(container, { rules: { "button-name": { enabled: false } } })
    ).toHaveNoViolations();
  });
});
