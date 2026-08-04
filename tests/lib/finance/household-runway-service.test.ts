import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHouseholdRunwayService } from "@/lib/finance/household-runway-service";
import {
  getHouseholdRunwayPlan,
  getRunwaySnapshots,
} from "@/lib/finance/repository";

vi.mock("@/lib/finance/repository", () => ({
  commitHouseholdRunwayPlan: vi.fn(),
  getHouseholdRunwayPlan: vi.fn(),
  getRunwaySnapshots: vi.fn(),
}));

describe("Household Runway service reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the domain Plan and assessment history without a persistence view", async () => {
    const plan = { revision: 7, inputs: { region: "CA" } };
    const snapshots = [{ id: "snapshot-1", trigger: "completed" }];
    vi.mocked(getHouseholdRunwayPlan).mockResolvedValue(plan as never);
    vi.mocked(getRunwaySnapshots).mockResolvedValue(snapshots as never);

    await expect(
      createHouseholdRunwayService({} as never).load("owner-1"),
    ).resolves.toEqual({ plan, snapshots });
    expect(getHouseholdRunwayPlan).toHaveBeenCalledWith({}, "owner-1");
    expect(getRunwaySnapshots).toHaveBeenCalledWith({}, "owner-1");
  });

  it("preserves a missing Plan as null while still returning history", async () => {
    vi.mocked(getHouseholdRunwayPlan).mockResolvedValue(null);
    vi.mocked(getRunwaySnapshots).mockResolvedValue([]);

    await expect(
      createHouseholdRunwayService({} as never).load("owner-1"),
    ).resolves.toEqual({ plan: null, snapshots: [] });
  });
});
