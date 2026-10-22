/** Isolated in-memory transactions used through the same lifecycle persistence interface. */

import type {
  RecurringTaskLifecyclePersistence,
  RecurringTaskLifecycleState,
  RecurringTaskSeries,
} from "./lifecycle-contract";

export class InMemoryRecurringTaskLifecyclePersistence
  implements RecurringTaskLifecyclePersistence
{
  private state: RecurringTaskLifecycleState = {
    series: new Map(),
    idempotency: new Map(),
  };

  private readonly locks = new Map<string, Promise<void>>();

  async read<T>(
    serializationKey: string,
    operation: (state: RecurringTaskLifecycleState) => Promise<T>,
  ): Promise<T> {
    await (this.locks.get(serializationKey) ?? Promise.resolve());
    return operation(cloneState(this.state));
  }

  async transaction<T>(
    serializationKey: string,
    operation: (state: RecurringTaskLifecycleState) => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(serializationKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(serializationKey, queued);

    await previous;
    try {
      const base = cloneState(this.state);
      const draft = cloneState(base);
      const result = await operation(draft);
      this.commit(serializationKey, base, draft);
      return result;
    } finally {
      release();
      if (this.locks.get(serializationKey) === queued) {
        this.locks.delete(serializationKey);
      }
    }
  }

  snapshot(): RecurringTaskLifecycleState {
    return cloneState(this.state);
  }

  private commit(
    serializationKey: string,
    base: RecurringTaskLifecycleState,
    draft: RecurringTaskLifecycleState,
  ): void {
    const [scope, identifier] = serializationKey.split(":", 2);
    if (scope === "series" && identifier) {
      const series = draft.series.get(identifier);
      if (series && changed(base.series.get(identifier), series)) {
        this.state.series.set(identifier, series);
      }
      this.mergeIdempotencyForSeries(identifier, base, draft);
      return;
    }
    if (scope === "user" && identifier) {
      for (const [seriesId, series] of draft.series) {
        if (
          series.userId === identifier
          && changed(base.series.get(seriesId), series)
        ) {
          this.state.series.set(seriesId, series);
        }
      }
      for (const [key, record] of draft.idempotency) {
        if (
          record.result.series.userId === identifier
          && changed(base.idempotency.get(key), record)
        ) {
          this.state.idempotency.set(key, record);
        }
      }
      return;
    }
    this.state = draft;
  }

  private mergeIdempotencyForSeries(
    seriesId: string,
    base: RecurringTaskLifecycleState,
    draft: RecurringTaskLifecycleState,
  ): void {
    for (const [key, record] of draft.idempotency) {
      if (
        record.result.series.id === seriesId
        && changed(base.idempotency.get(key), record)
      ) {
        this.state.idempotency.set(key, record);
      }
    }
  }
}

function cloneState(state: RecurringTaskLifecycleState): RecurringTaskLifecycleState {
  return {
    series: new Map(
      [...state.series.entries()].map(([id, series]) => [id, cloneSeries(series)]),
    ),
    idempotency: new Map(
      [...state.idempotency.entries()].map(([key, record]) => [
        key,
        structuredClone(record),
      ]),
    ),
  };
}

function changed<T>(before: T | undefined, after: T | undefined): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function cloneSeries(series: RecurringTaskSeries): RecurringTaskSeries {
  return structuredClone(series);
}
