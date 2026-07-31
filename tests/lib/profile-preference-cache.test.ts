import { describe, expect, it } from "vitest";
import {
  ProfilePreferenceIntentCoordinator,
  mergeAcceptedPreferenceOutcome,
} from "@/lib/profile-preference-cache";

type Outcome = {
  profile: {
    id: string;
    full_name: string | null;
    updated_at: string;
    preferences: Record<string, unknown>;
  };
};

const outcome = (
  fullName: string,
  preferences: Record<string, unknown>,
  updatedAt = "2026-07-30T12:00:02.000000+00:00",
): Outcome => ({
  profile: {
    id: "user-123",
    full_name: fullName,
    updated_at: updatedAt,
    preferences,
  },
});

describe("accepted profile preference outcomes", () => {
  it("preserves cached profile fields while using server preferences", () => {
    const accepted = outcome("New server name", {
      theme: "dark",
      weight_unit: "kg",
    });

    expect(
      mergeAcceptedPreferenceOutcome(
        outcome("Stale cached name", {
          theme: "light",
          weight_unit: "lbs",
        }, "2026-07-30T12:00:01.000000+00:00"),
        accepted,
      ),
    ).toEqual(
      outcome("Stale cached name", {
        theme: "dark",
        weight_unit: "kg",
      }, "2026-07-30T12:00:01.000000+00:00"),
    );
  });

  it("does not let stale cached preferences override another caller", () => {
    const cached = outcome("Current name", {
      theme: "dark",
      weight_unit: "lbs",
    });

    expect(
      mergeAcceptedPreferenceOutcome(
        cached,
        outcome("Stale name", {
          theme: "light",
          weight_unit: "kg",
        }, "2026-07-30T12:00:01.000000+00:00"),
      ),
    ).toEqual(
      outcome("Current name", {
        theme: "light",
        weight_unit: "kg",
      }),
    );
  });

  it("preserves only accepted local intents whose responses are newer", () => {
    const coordinator = new ProfilePreferenceIntentCoordinator();
    const first = coordinator.begin({ week_start_day: 0 });
    const second = coordinator.begin({ weight_unit: "lbs" });

    const newerOutcome = coordinator.accept(
      second,
      outcome("Current name", {
        week_start_day: 0,
        weight_unit: "lbs",
        theme: "dark",
      }),
    );
    const reorderedOlderOutcome = coordinator.accept(
      first,
      outcome("Stale name", {
        week_start_day: 0,
        weight_unit: "kg",
        theme: "light",
      }, "2026-07-30T12:00:01.000000+00:00"),
      newerOutcome,
    );

    expect(newerOutcome.profile.preferences.weight_unit).toBe("lbs");
    expect(reorderedOlderOutcome).toEqual(
      outcome("Current name", {
        week_start_day: 0,
        weight_unit: "lbs",
        theme: "light",
      }),
    );
  });

  it("preserves an accepted intent when a later intent returns a stale response", () => {
    const coordinator = new ProfilePreferenceIntentCoordinator();
    const first = coordinator.begin({ week_start_day: 0 });
    const second = coordinator.begin({ weight_unit: "lbs" });

    const firstOutcome = coordinator.accept(
      first,
      outcome("Current name", {
        week_start_day: 0,
        weight_unit: "lbs",
        theme: "dark",
      }),
    );

    expect(
      coordinator.accept(
        second,
        outcome("Stale name", {
          week_start_day: 1,
          weight_unit: "lbs",
          theme: "light",
        }, "2026-07-30T12:00:01.000000+00:00"),
        firstOutcome,
      ),
    ).toEqual(
      outcome("Current name", {
        week_start_day: 0,
        weight_unit: "lbs",
        theme: "light",
      }),
    );
  });

  it("does not let an older accepted intent replace a newer same-key intent", () => {
    const coordinator = new ProfilePreferenceIntentCoordinator();
    const first = coordinator.begin({ theme: "light" });
    const second = coordinator.begin({ theme: "dark" });

    const firstOutcome = coordinator.accept(
      first,
      outcome("Current name", {
        theme: "light",
        weight_unit: "kg",
      }),
    );

    expect(
      coordinator.accept(
        second,
        outcome("Current name", {
          theme: "dark",
          weight_unit: "kg",
        }),
        firstOutcome,
      ),
    ).toEqual(
      outcome("Current name", {
        theme: "dark",
        weight_unit: "kg",
      }),
    );
  });

  it("does not preserve an unaccepted or failed local intent", () => {
    const coordinator = new ProfilePreferenceIntentCoordinator();
    const first = coordinator.begin({ week_start_day: 0 });
    const failedSecond = coordinator.begin({ weight_unit: "lbs" });
    coordinator.reject(failedSecond);

    expect(
      coordinator.accept(
        first,
        outcome("Server name", {
          week_start_day: 0,
          weight_unit: "kg",
        }),
      ),
    ).toEqual(
      outcome("Server name", {
        week_start_day: 0,
        weight_unit: "kg",
      }),
    );
  });
});
