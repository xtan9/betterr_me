import type { KeyedMutator } from "swr";
import type { PreferencesValues } from "@/lib/validations/preferences";
import { profilePreferenceIntents } from "@/lib/profile-preference-cache";

export interface ProfilePreferenceOutcome {
  profile: {
    preferences: object;
  };
}

export class ProfilePreferenceIntentError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProfilePreferenceIntentError";
  }
}

export async function submitProfilePreferenceIntent<
  Outcome extends ProfilePreferenceOutcome,
>(
  patch: PreferencesValues,
  mutate: KeyedMutator<Outcome>,
): Promise<Outcome> {
  const intent = profilePreferenceIntents.begin(patch);

  try {
    const response = await fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      throw new ProfilePreferenceIntentError(
        "Failed to update profile preferences",
        response.status,
      );
    }

    const accepted = (await response.json()) as Outcome;
    await mutate(
      (cached) => profilePreferenceIntents.accept(intent, accepted, cached),
      { revalidate: false },
    );

    await mutate().catch((error) => {
      console.error("Failed to revalidate accepted profile preferences:", error);
    });

    return accepted;
  } catch (error) {
    profilePreferenceIntents.reject(intent);
    throw error;
  }
}
