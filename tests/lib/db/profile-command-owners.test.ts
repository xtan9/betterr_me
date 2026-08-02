import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppearanceDB } from "@/lib/db/appearance";
import { FitnessDB } from "@/lib/db/fitness";
import { ProfileDetailsDB } from "@/lib/db/profile-details";
import { UserTimeZoneDB } from "@/lib/db/user-time-zone";

describe("explicit profile owner database seams", () => {
  it("keeps Appearance persistence on its owner command", async () => {
    const outcome = { theme: "dark", preferenceRevision: 2, changed: true };
    const rpc = vi.fn().mockResolvedValue({ data: outcome, error: null });

    await expect(
      new AppearanceDB({ rpc } as unknown as SupabaseClient).setAppearancePreference(
        "dark",
      ),
    ).resolves.toEqual(outcome);
    expect(rpc).toHaveBeenCalledWith("set_appearance_preference", {
      theme: "dark",
    });
  });

  it("keeps Profile Details persistence on its owner command", async () => {
    const outcome = {
      fullName: "Taylor Example",
      avatarUrl: null,
      changed: true,
    };
    const rpc = vi.fn().mockResolvedValue({ data: outcome, error: null });

    await expect(
      new ProfileDetailsDB({ rpc } as unknown as SupabaseClient).updateProfileDetails(
        { fullName: "Taylor Example" },
      ),
    ).resolves.toEqual(outcome);
    expect(rpc).toHaveBeenCalledWith("update_profile_details", {
      details_patch: { full_name: "Taylor Example" },
    });
  });

  it("keeps User Time Zone persistence on its owner command", async () => {
    const outcome = { timeZone: "America/New_York", changed: true };
    const rpc = vi.fn().mockResolvedValue({ data: outcome, error: null });

    await expect(
      new UserTimeZoneDB({ rpc } as unknown as SupabaseClient).setUserTimeZone(
        "America/New_York",
      ),
    ).resolves.toEqual(outcome);
    expect(rpc).toHaveBeenCalledWith("set_user_time_zone", {
      time_zone: "America/New_York",
    });
  });

  it("surfaces owner-command database errors", async () => {
    const error = new Error("database unavailable");

    await expect(
      new AppearanceDB({
        rpc: vi.fn().mockResolvedValue({ data: null, error }),
      } as unknown as SupabaseClient).setAppearancePreference("dark"),
    ).rejects.toThrow("database unavailable");

    await expect(
      new FitnessDB({
        rpc: vi.fn().mockResolvedValue({ data: null, error }),
      } as unknown as SupabaseClient).setFitnessPreference("kg"),
    ).rejects.toThrow("database unavailable");

    await expect(
      new ProfileDetailsDB({
        rpc: vi.fn().mockResolvedValue({ data: null, error }),
      } as unknown as SupabaseClient).updateProfileDetails({
        fullName: "Taylor Example",
      }),
    ).rejects.toThrow("database unavailable");

    await expect(
      new UserTimeZoneDB({
        rpc: vi.fn().mockResolvedValue({ data: null, error }),
      } as unknown as SupabaseClient).setUserTimeZone("America/New_York"),
    ).rejects.toThrow("database unavailable");
  });

  it("reports a missing profile when an owner command returns no data", async () => {
    const missing = () => vi.fn().mockResolvedValue({ data: null, error: null });

    await expect(
      new AppearanceDB({ rpc: missing() } as unknown as SupabaseClient).setAppearancePreference(
        "dark",
      ),
    ).rejects.toThrow("Profile not found");

    await expect(
      new FitnessDB({ rpc: missing() } as unknown as SupabaseClient).setFitnessPreference(
        "kg",
      ),
    ).rejects.toThrow("Profile not found");

    await expect(
      new ProfileDetailsDB({ rpc: missing() } as unknown as SupabaseClient).updateProfileDetails(
        { fullName: "Taylor Example" },
      ),
    ).rejects.toThrow("Profile not found");

    await expect(
      new UserTimeZoneDB({ rpc: missing() } as unknown as SupabaseClient).setUserTimeZone(
        "America/New_York",
      ),
    ).rejects.toThrow("Profile not found");
  });
});
