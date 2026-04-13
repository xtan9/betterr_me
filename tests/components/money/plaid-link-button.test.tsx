import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { toast } from "sonner";
import { PlaidLinkButton } from "@/components/money/plaid-link-button";

expect.extend(matchers);

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Capture usePlaidLink callbacks so tests can invoke onSuccess/onExit directly
interface PlaidLinkState {
  token: string | null;
  onSuccess?: (publicToken: string) => void;
  onExit?: (err: unknown) => void;
  open: ReturnType<typeof vi.fn>;
  ready: boolean;
}

const plaidState: PlaidLinkState = {
  token: null,
  onSuccess: undefined,
  onExit: undefined,
  open: vi.fn(),
  ready: true,
};

vi.mock("react-plaid-link", () => ({
  usePlaidLink: ({
    token,
    onSuccess,
    onExit,
  }: {
    token: string | null;
    onSuccess: (t: string) => void;
    onExit: (err: unknown) => void;
  }) => {
    plaidState.token = token;
    plaidState.onSuccess = onSuccess;
    plaidState.onExit = onExit;
    return { open: plaidState.open, ready: plaidState.ready };
  },
}));

function mockFetchOnce(responses: Array<Partial<Response> & { jsonValue?: unknown; jsonThrow?: boolean }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: r.ok ?? true,
      json: r.jsonThrow
        ? async () => {
            throw new Error("no json");
          }
        : async () => r.jsonValue,
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PlaidLinkButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plaidState.open = vi.fn();
    plaidState.ready = true;
    plaidState.token = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a link token on mount and passes it to usePlaidLink", async () => {
    mockFetchOnce([{ ok: true, jsonValue: { link_token: "link-token-123" } }]);

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(plaidState.token).toBe("link-token-123");
    });
    // Button is enabled once token fetch finishes and plaid is ready
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /plaid\.connectBank/ })
      ).not.toBeDisabled();
    });
  });

  it("renders disabled button while the token request is in flight", async () => {
    // Never-resolving fetch keeps isLoadingToken true
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
    );

    render(<PlaidLinkButton />);

    expect(
      screen.getByRole("button", { name: /plaid\.connectBank/ })
    ).toBeDisabled();

    // Clean up the pending promise
    resolveFetch({
      ok: true,
      json: async () => ({ link_token: "ok" }),
    });
  });

  it("swallows link-token fetch errors (non-ok response) without crashing", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchOnce([{ ok: false, jsonValue: { error: "no-good" } }]);

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    expect(plaidState.token).toBeNull();
    errorSpy.mockRestore();
  });

  it("handles link-token fetch errors when response body is not JSON", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetchOnce([{ ok: false, jsonThrow: true }]);

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    errorSpy.mockRestore();
  });

  it("clicking the button calls open()", async () => {
    mockFetchOnce([{ ok: true, jsonValue: { link_token: "tok" } }]);
    const user = userEvent.setup();

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(plaidState.token).toBe("tok");
    });

    await user.click(screen.getByRole("button", { name: /plaid\.connectBank/ }));
    expect(plaidState.open).toHaveBeenCalled();
  });

  it("is disabled while plaid link is not ready", async () => {
    plaidState.ready = false;
    mockFetchOnce([{ ok: true, jsonValue: { link_token: "tok" } }]);

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(plaidState.token).toBe("tok");
    });
    expect(
      screen.getByRole("button", { name: /plaid\.connectBank/ })
    ).toBeDisabled();
  });

  it("onSuccess posts public token and shows success toast", async () => {
    const fetchMock = vi.fn();
    // First call: link token
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ link_token: "tok" }),
    });
    // Second call: exchange
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    const mutate = vi.fn();

    render(<PlaidLinkButton mutate={mutate} />);

    await waitFor(() => {
      expect(plaidState.onSuccess).toBeTruthy();
    });
    await act(async () => {
      await plaidState.onSuccess!("public-token-abc");
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("plaid.connectSuccess");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/money/plaid/exchange-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ public_token: "public-token-abc" }),
      })
    );
    expect(mutate).toHaveBeenCalledWith(undefined, { revalidate: false });
  });

  it("onSuccess shows error toast when exchange fails (non-ok)", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ link_token: "tok" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "bad" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(plaidState.onSuccess).toBeTruthy();
    });
    await act(async () => {
      await plaidState.onSuccess!("public-token");
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("plaid.exchangeError");
    });
    errorSpy.mockRestore();
  });

  it("onSuccess shows error toast when exchange response is not JSON", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ link_token: "tok" }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(plaidState.onSuccess).toBeTruthy();
    });
    await act(async () => {
      await plaidState.onSuccess!("public-token");
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("plaid.exchangeError");
    });
    errorSpy.mockRestore();
  });

  it("onExit with an error logs and shows an error toast", async () => {
    mockFetchOnce([{ ok: true, jsonValue: { link_token: "tok" } }]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(plaidState.onExit).toBeTruthy();
    });
    plaidState.onExit!({ error_code: "USER_EXIT" });

    expect(toast.error).toHaveBeenCalledWith("plaid.linkError");
    errorSpy.mockRestore();
  });

  it("onExit with no error is a no-op", async () => {
    mockFetchOnce([{ ok: true, jsonValue: { link_token: "tok" } }]);

    render(<PlaidLinkButton />);

    await waitFor(() => {
      expect(plaidState.onExit).toBeTruthy();
    });
    plaidState.onExit!(null);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    mockFetchOnce([{ ok: true, jsonValue: { link_token: "tok" } }]);

    const { container } = render(<PlaidLinkButton />);
    await waitFor(() => expect(plaidState.token).toBe("tok"));
    expect(await axe(container)).toHaveNoViolations();
  });
});
