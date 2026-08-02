import { afterEach, describe, expect, it, vi } from "vitest";

describe("API-key route build boundary", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/supabase/client");
    vi.resetModules();
  });

  it("does not evaluate browser DB singletons when routes are imported", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/client", () => {
      throw new Error("browser Supabase client must not be imported by API routes");
    });

    const [collectionRoute, itemRoute] = await Promise.all([
      import("@/app/api/api-keys/route"),
      import("@/app/api/api-keys/[id]/route"),
    ]);

    expect(collectionRoute.GET).toBeTypeOf("function");
    expect(collectionRoute.POST).toBeTypeOf("function");
    expect(itemRoute.DELETE).toBeTypeOf("function");
  });
});
