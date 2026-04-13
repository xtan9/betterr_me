import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { toast } from "sonner";
import { ContributeDialog } from "@/components/money/contribute-dialog";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ContributeDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not render dialog content when closed", () => {
    render(
      <ContributeDialog
        goalId="goal-1"
        open={false}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.queryByText("addFunds")).not.toBeInTheDocument();
  });

  it("renders heading and form when open", () => {
    render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    // Heading + submit button both read "addFunds"
    expect(screen.getAllByText("addFunds").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("amount")).toBeInTheDocument();
    expect(screen.getByLabelText("note")).toBeInTheDocument();
  });

  it("shows validation error when amount is missing", async () => {
    render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "addFunds" }));
    expect(await screen.findByText("Required")).toBeInTheDocument();
  });

  it("rejects non-positive amount", async () => {
    render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "addFunds" }));
    expect(await screen.findByText("Must be positive")).toBeInTheDocument();
  });

  it("submits POST with parsed amount and note, then calls onSuccess", async () => {
    const onSuccess = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ContributeDialog
        goalId="goal-42"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "25.50" } });
    fireEvent.change(screen.getByLabelText("note"), { target: { value: "Paycheck" } });
    fireEvent.click(screen.getByRole("button", { name: "addFunds" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/money/goals/goal-42/contributions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ amount: 25.5, note: "Paycheck" });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("contributionAdded");
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("omits note when empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "addFunds" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ amount: 10, note: undefined });
  });

  it("does not submit when goalId is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ContributeDialog
        goalId=""
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "addFunds" }));

    // Let the submit handler run
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("server error: uses error field from JSON body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Goal locked" }),
      })
    );

    render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "addFunds" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Goal locked");
    });
  });

  it("server error with non-JSON body: falls back to generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error("bad json");
        },
      })
    );

    render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "addFunds" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to add contribution");
    });
  });

  it("cancel button calls onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no accessibility violations when open", async () => {
    const { baseElement } = render(
      <ContributeDialog
        goalId="goal-1"
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
