import { describe, expect, it, vi } from "vitest";
import {
  createHouseholdRunwayBrowserAdapter,
  type HouseholdRunwayBrowserEnvironment,
} from "@/lib/finance/household-runway-browser-adapter";
import { createHouseholdRunwayInterview } from "@/lib/finance/internal/household-runway-interview";
import { rememberHouseholdRunwayDraft } from "@/lib/finance/internal/runway-draft-client";

function createAdapterEnvironment(
  href = "https://betterr.me/finance/cushion?start=1",
) {
  const listeners = new Map<string, Set<() => void>>();
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  const environment: HouseholdRunwayBrowserEnvironment = {
    location: { href },
    history: {
      back: vi.fn(),
      pushState: vi.fn((_data, _unused, url) => {
        if (url) {
          environment.location.href = new URL(
            String(url),
            environment.location.href,
          ).href;
        }
      }),
      replaceState: vi.fn((_data, _unused, url) => {
        if (url) {
          environment.location.href = new URL(
            String(url),
            environment.location.href,
          ).href;
        }
      }),
    },
    document: { getElementById: vi.fn(() => ({ focus: vi.fn() })) },
    requestAnimationFrame: vi.fn((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id) => frames.delete(id)),
    addEventListener: vi.fn((type, listener) => {
      const current = listeners.get(type) ?? new Set<() => void>();
      current.add(listener);
      listeners.set(type, current);
    }),
    removeEventListener: vi.fn((type, listener) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  return {
    environment,
    emit(type: string) {
      listeners.get(type)?.forEach((listener) => listener());
    },
    runFrames() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
    listeners,
  };
}

async function settleAdapter() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await Promise.resolve();
  }
}

describe("Household Runway browser adapter", () => {
  it("projects the initial destination and repairs an impossible requested stage", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?stage=expenses",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });

    adapter.start();
    await settleAdapter();

    expect(adapter.getSnapshot()).toMatchObject({
      interviewStatus: "not_started",
      stage: null,
      screen: { kind: "landing" },
    });
    expect(browser.environment.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion",
    );
    adapter.dispose();
  });

  it("keeps an anonymous landing screen until the public start intent is sent", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: false,
      autoStart: false,
      createId: () => "interview-1",
      synchronizeDraft: () => true,
    });

    adapter.start();
    await settleAdapter();

    expect(adapter.getSnapshot()).toMatchObject({
      interviewStatus: "not_started",
      screen: { kind: "landing" },
    });
    expect(browser.environment.history.pushState).not.toHaveBeenCalled();

    adapter.send({ type: "start" });
    await settleAdapter();

    expect(adapter.getSnapshot().screen.kind).toBe("location");
    expect(browser.environment.history.pushState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion?start=1",
    );
    adapter.dispose();
  });

  it("imports a restored device Draft when the URL starts the anonymous Interview", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?start=1",
    );
    const restored = createHouseholdRunwayInterview();
    restored.draft.revision = 1;
    restored.draft.interviewId = "stored-interview";
    sessionStorage.clear();
    localStorage.clear();
    rememberHouseholdRunwayDraft({
      status: "collecting",
      stage: "location",
      draft: restored.draft,
    });
    sessionStorage.clear();
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: false,
      autoStart: false,
      createId: () => "interview-1",
    });

    adapter.start();
    await settleAdapter();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await Promise.resolve();
    }

    expect(adapter.getSnapshot().screen.kind).toBe("location");
    expect(adapter.getSnapshot().operations.deviceDraft).toEqual({
      status: "succeeded",
    });
    expect(localStorage.getItem("betterr.household-runway.interview.v2")).toBeNull();
    adapter.dispose();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("keeps a destructive navigation command ahead of URL reconciliation", async () => {
    const browser = createAdapterEnvironment();
    const confirm = vi.fn(() => true);
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: false,
      autoStart: false,
      confirm,
      clearDraft: () => true,
      createId: () => "interview-1",
      synchronizeDraft: () => true,
    });

    adapter.start();
    await settleAdapter();
    adapter.send({ type: "start" });
    adapter.send({ type: "discard_draft" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve();
    }

    expect(confirm).toHaveBeenCalledWith({ action: "discard_work" });
    expect(adapter.getSnapshot()).toMatchObject({
      interviewStatus: "not_started",
      screen: { kind: "landing" },
    });
    expect(browser.environment.location.href).toBe(
      "https://betterr.me/finance/cushion",
    );
    adapter.dispose();
  });

  it("auto-starts authenticated Runtime state and repairs the URL once", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: true,
      createId: () => "interview-1",
    });

    adapter.start();
    await settleAdapter();

    expect(adapter.getSnapshot().screen.kind).toBe("location");
    expect(browser.environment.location.href).toBe(
      "https://betterr.me/finance/cushion?start=1",
    );
    expect(browser.environment.history.pushState).toHaveBeenCalledTimes(1);
    adapter.dispose();
  });

  it("repairs an invalid requested stage even when the URL starts the interview", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?start=1&stage=not-a-stage",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });

    adapter.start();
    await settleAdapter();

    expect(adapter.getSnapshot().interviewStatus).toBe("collecting");
    expect(browser.environment.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion?start=1",
    );
    adapter.dispose();
  });

  it("does not honor a valid but unreachable stage from a fresh URL", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?start=1&stage=expenses",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });

    adapter.start();
    await settleAdapter();

    expect(adapter.getSnapshot().stage).toBe("location");
    expect(browser.environment.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion?start=1",
    );
    adapter.dispose();
  });

  it("validates Back and Forward through Runtime state instead of browser state", async () => {
    const browser = createAdapterEnvironment();
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });
    adapter.start();
    await settleAdapter();

    expect(adapter.getSnapshot().interviewStatus).toBe("collecting");
    browser.environment.location.href = "https://betterr.me/finance/cushion";
    browser.emit("popstate");
    expect(adapter.getSnapshot().interviewStatus).toBe("not_started");

    browser.environment.location.href = "https://betterr.me/finance/cushion?start=1";
    browser.emit("popstate");
    expect(adapter.getSnapshot().interviewStatus).toBe("collecting");
    adapter.dispose();
  });

  it("reconciles fragment-only navigation through the private history path", async () => {
    const browser = createAdapterEnvironment();
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });
    adapter.start();
    await settleAdapter();

    browser.environment.location.href =
      "https://betterr.me/finance/cushion#runway";
    browser.emit("hashchange");

    expect(adapter.getSnapshot().interviewStatus).toBe("not_started");
    expect(browser.environment.history.replaceState).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("uses the latest browser destination when history changes during startup", async () => {
    const browser = createAdapterEnvironment();
    let restore: ((value: unknown) => void) | undefined;
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
      restore: () => new Promise((resolve) => { restore = resolve; }),
    });

    adapter.start();
    browser.environment.location.href = "https://betterr.me/finance/cushion";
    browser.emit("popstate");
    restore?.({ session: { status: "missing" }, device: { status: "missing" } });
    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.getSnapshot().interviewStatus).toBe("not_started");
    adapter.dispose();
  });

  it("flushes the latest eligible Draft synchronously on locale change", async () => {
    const browser = createAdapterEnvironment();
    const synchronizeDraft = vi.fn(() => true);
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
      synchronizeDraft,
    });
    adapter.start();
    await settleAdapter();
    adapter.send({ type: "select_country", country: "US" });

    browser.emit("betterr:before-locale-change");

    expect(synchronizeDraft).toHaveBeenCalledWith({
      status: "collecting",
      stage: "location",
      answers: expect.objectContaining({ country: "US" }),
    });
    expect(adapter.getSnapshot().operations.draftSynchronization).toEqual({
      status: "succeeded",
    });
    adapter.dispose();
  });

  it("still flushes when the optional locale provider is unavailable", async () => {
    const browser = createAdapterEnvironment();
    const synchronizeDraft = vi.fn(() => true);
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
      localeProvider: () => {
        throw new Error("locale unavailable");
      },
      synchronizeDraft,
    });
    adapter.start();
    await settleAdapter();
    adapter.send({ type: "select_country", country: "US" });

    expect(() => browser.emit("betterr:before-locale-change")).not.toThrow();
    expect(synchronizeDraft).toHaveBeenCalledOnce();
    adapter.dispose();
  });

  it("keeps a failed locale flush failed and ignores its late completion after disposal", async () => {
    const browser = createAdapterEnvironment();
    let resolveSync: ((value: boolean) => void) | undefined;
    const synchronizeDraft = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveSync = resolve; }),
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
      synchronizeDraft,
    });
    adapter.start();
    await settleAdapter();
    adapter.send({ type: "select_country", country: "US" });
    browser.emit("betterr:before-locale-change");

    expect(adapter.getSnapshot().operations.draftSynchronization).toEqual({
      status: "pending",
    });
    adapter.dispose();
    resolveSync?.(false);
    await Promise.resolve();
    expect(adapter.getSnapshot().operations.draftSynchronization).toEqual({
      status: "pending",
    });
  });

  it("removes subscriptions and cancellable focus work, allowing an independent remount", () => {
    const browser = createAdapterEnvironment();
    const first = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "first",
      schedule: (task) => task(),
    });
    first.start();
    expect(browser.listeners.get("popstate")?.size).toBe(1);
    expect(browser.listeners.get("hashchange")?.size).toBe(1);
    expect(browser.listeners.get("betterr:before-locale-change")?.size).toBe(1);
    first.dispose();
    expect(browser.listeners.get("popstate")?.size).toBe(0);
    expect(browser.listeners.get("hashchange")?.size).toBe(0);
    expect(browser.listeners.get("betterr:before-locale-change")?.size).toBe(0);

    const second = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "second",
    });
    second.start();
    expect(browser.listeners.get("popstate")?.size).toBe(1);
    expect(browser.listeners.get("hashchange")?.size).toBe(1);
    expect(browser.listeners.get("betterr:before-locale-change")?.size).toBe(1);
    second.dispose();
  });

  it("owns lifecycle analytics through the supported browser adapter seam", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion",
    );
    const trackAnalytics = vi.fn(() => true);
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: false,
      autoStart: false,
      trackAnalytics,
    });

    adapter.start();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve();
    }

    expect(trackAnalytics).toHaveBeenCalledWith({
      eventName: "landing_view",
      stage: "landing",
    });
    adapter.send({ type: "registration_clicked" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve();
    }
    expect(trackAnalytics).toHaveBeenCalledWith({
      eventName: "registration_clicked",
      stage: "result",
    });
    adapter.dispose();
  });
});
