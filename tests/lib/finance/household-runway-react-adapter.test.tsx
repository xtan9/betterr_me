import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createHouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewIntent,
} from "@/lib/finance/household-runway-interview-runtime";
import { useHouseholdRunwayRuntime } from "@/lib/finance/household-runway-react-adapter";

describe("Household Runway React Runtime adapter", () => {
  it("keeps one lifecycle per mount, subscribes before startup, and remounts independently", async () => {
    const events: string[] = [];
    const createAdapter = vi.fn(() => {
      const runtime = createHouseholdRunwayInterviewRuntime({
        createId: () => "interview-1",
      });
      return {
        getSnapshot: runtime.getSnapshot,
        subscribe(listener: () => void) {
          events.push("subscribe");
          const unsubscribe = runtime.subscribe(listener);
          return () => {
            events.push("unsubscribe");
            unsubscribe();
          };
        },
        start() {
          events.push("start");
          runtime.start();
        },
        send(intent: HouseholdRunwayInterviewIntent) {
          events.push(`send:${intent.type}`);
          runtime.send(intent);
        },
        dispose() {
          events.push("dispose");
          runtime.dispose();
        },
      };
    });

    const options = { createAdapter };
    const first = renderHook(() => useHouseholdRunwayRuntime(options), {
      wrapper: StrictMode,
    });

    expect(createAdapter).toHaveBeenCalledOnce();
    expect(events.indexOf("subscribe")).toBeLessThan(events.indexOf("start"));
    first.result.current.send({ type: "start_new" });
    expect(events).toContain("send:start_new");
    first.unmount();
    await Promise.resolve();
    expect(events).toContain("dispose");

    const second = renderHook(() => useHouseholdRunwayRuntime(options), {
      wrapper: StrictMode,
    });
    expect(createAdapter).toHaveBeenCalledTimes(2);
    second.unmount();
    await Promise.resolve();
    expect(events.filter((event) => event === "dispose")).toHaveLength(2);
  });
});
