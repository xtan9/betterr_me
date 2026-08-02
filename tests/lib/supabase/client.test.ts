import { afterEach, describe, expect, it, vi } from "vitest";

const createBrowserClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

describe("browser Supabase client boundary", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/supabase/client");
    vi.resetModules();
    vi.unstubAllEnvs();
    createBrowserClient.mockReset();
  });

  it("defers missing public configuration until the client is used", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/client");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const { createClient } = await import("@/lib/supabase/client");
    const client = createClient();

    expect(createBrowserClient).not.toHaveBeenCalled();
    expect(() => client.auth).toThrow(
      "Supabase browser client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  });

  it("uses the configured browser client without changing its auth client construction", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/client");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    const configuredClient = { auth: {} };
    createBrowserClient.mockReturnValue(configuredClient);

    const { createClient } = await import("@/lib/supabase/client");

    expect(createClient()).toBe(configuredClient);
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "test-anon-key",
    );
  });
});
