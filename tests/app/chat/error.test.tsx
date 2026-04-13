import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  log: {
    error: logError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import ChatError from "@/app/chat/error";

describe("ChatError boundary", () => {
  beforeEach(() => {
    logError.mockClear();
  });

  it("logs the thrown error via log.error with the [chat] scope prefix", () => {
    const err = new Error("boom");
    render(<ChatError error={err} reset={() => {}} />);

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("[chat] Rendering error", err);
  });

  it("renders fallback UI with a retry button", () => {
    const reset = vi.fn();
    render(<ChatError error={new Error("boom")} reset={reset} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
