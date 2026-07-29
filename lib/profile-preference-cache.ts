type PreferencePatch = Record<string, unknown>;

export interface PreferenceIntent {
  readonly sequence: number;
  readonly patch: PreferencePatch;
}

interface TrackedIntent extends PreferenceIntent {
  accepted: boolean;
}

export function mergeAcceptedPreferenceOutcome<
  Outcome extends { profile: { preferences: object } },
>(
  _cached: Outcome | undefined,
  accepted: Outcome,
  acceptedLocalIntents: readonly PreferencePatch[] = [],
): Outcome {
  if (acceptedLocalIntents.length === 0) return accepted;

  return {
    ...accepted,
    profile: {
      ...accepted.profile,
      preferences: Object.assign(
        {},
        accepted.profile.preferences,
        ...acceptedLocalIntents,
      ),
    },
  };
}

/**
 * Orders accepted local preference intents independently of response order.
 * The server outcome remains authoritative except for explicitly tracked
 * local intents whose newer responses have already been accepted.
 */
export class ProfilePreferenceIntentCoordinator {
  private nextSequence = 1;
  private readonly intents = new Map<number, TrackedIntent>();

  begin(patch: PreferencePatch): PreferenceIntent {
    const intent = {
      sequence: this.nextSequence++,
      patch: { ...patch },
      accepted: false,
    };
    this.intents.set(intent.sequence, intent);
    return intent;
  }

  accept<Outcome extends { profile: { preferences: object } }>(
    intent: PreferenceIntent,
    accepted: Outcome,
  ): Outcome {
    const tracked = this.intents.get(intent.sequence);
    if (tracked) tracked.accepted = true;

    const otherAcceptedIntents = [...this.intents.values()]
      .filter(
        (candidate) =>
          candidate.sequence !== intent.sequence && candidate.accepted,
      )
      .sort((left, right) => left.sequence - right.sequence)
      .map((candidate) =>
        Object.fromEntries(
          Object.entries(candidate.patch).filter(
            ([key]) =>
              candidate.sequence > intent.sequence ||
              !(key in intent.patch),
          ),
        ),
      )
      .filter((patch) => Object.keys(patch).length > 0);

    const outcome = mergeAcceptedPreferenceOutcome(
      undefined,
      accepted,
      otherAcceptedIntents,
    );
    this.clearIfSettled();
    return outcome;
  }

  reject(intent: PreferenceIntent): void {
    this.intents.delete(intent.sequence);
    this.clearIfSettled();
  }

  private clearIfSettled(): void {
    if ([...this.intents.values()].every((intent) => intent.accepted)) {
      this.intents.clear();
    }
  }
}

export const profilePreferenceIntents =
  new ProfilePreferenceIntentCoordinator();
