import { describe, expect, it } from "vitest";
import {
  ProfilePreferenceIntentCoordinator,
  mergeAcceptedPreferenceOutcome,
} from "@/lib/profile-preference-cache";

type Outcome = {
  profile: {
    id: string;
    full_name: string | null;
    preferences: Record<string, unknown>;
  };
};

const outcome = (
  fullName: string,
  preferences: Record<string, unknown>,
): Outcome => ({
  profile: {
    id: "user-123",
    full_name: fullName,
    preferences,
  },
});

describe("accepted profile preference outcomes", () => {
  it("uses the accepted server profile instead of unrelated cached values", () => {
    const accepted = outcome("New server name", {
      theme: "dark",
      weight_unit: "kg",
    });

    expect(
      mergeAcceptedPreferenceOutcome(
        outcome("Stale cached name", {
          theme: "light",
          weight_unit: "lbs",
        }),
        accepted,
      ),
    ).toEqual(accepted);
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
      }),
    );

    expect(newerOutcome.profile.preferences.weight_unit).toBe("lbs");
    expect(reorderedOlderOutcome).toEqual(
      outcome("Stale name", {
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

    coordinator.accept(
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
        }),
      ),
    ).toEqual(
      outcome("Stale name", {
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

    coordinator.accept(
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
