import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSwipe } from "@/hooks/use-swipe";

function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>, type: "start" | "end") {
  // Minimal React.TouchEvent-like stub
  const list = touches.map((t) => ({ clientX: t.clientX, clientY: t.clientY })) as unknown as TouchList;
  if (type === "start") {
    return { touches: list } as unknown as React.TouchEvent;
  }
  return { changedTouches: list } as unknown as React.TouchEvent;
}

describe("useSwipe", () => {
  it("fires onSwipeLeft when horizontal delta is negative and exceeds threshold", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onLeft, onRight));

    act(() => {
      result.current.onTouchStart(makeTouchEvent([{ clientX: 200, clientY: 100 }], "start"));
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 100, clientY: 110 }], "end"));
    });

    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).not.toHaveBeenCalled();
  });

  it("fires onSwipeRight when horizontal delta is positive and exceeds threshold", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onLeft, onRight));

    act(() => {
      result.current.onTouchStart(makeTouchEvent([{ clientX: 50, clientY: 100 }], "start"));
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 200, clientY: 90 }], "end"));
    });

    expect(onRight).toHaveBeenCalledTimes(1);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it("does not fire when horizontal delta is below threshold", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onLeft, onRight, { threshold: 50 }));

    act(() => {
      result.current.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }], "start"));
      // 30px horizontal < 50 threshold
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 130, clientY: 100 }], "end"));
    });

    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("does not fire when movement is mostly vertical (1.5x rule)", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onLeft, onRight));

    act(() => {
      result.current.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }], "start"));
      // dx=60 but dy=200 — vertical dominates
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 160, clientY: 300 }], "end"));
    });

    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("ignores touchEnd without a prior touchStart", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onLeft, onRight));

    act(() => {
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 500, clientY: 0 }], "end"));
    });

    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });

  it("respects custom threshold option", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onLeft, onRight, { threshold: 10 }));

    act(() => {
      result.current.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }], "start"));
      // 15px horizontal > 10 threshold and dominant
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 115, clientY: 101 }], "end"));
    });

    expect(onRight).toHaveBeenCalledTimes(1);
  });

  it("resets state after each swipe so a subsequent touchEnd without start is ignored", () => {
    const onLeft = vi.fn();
    const onRight = vi.fn();
    const { result } = renderHook(() => useSwipe(onLeft, onRight));

    act(() => {
      result.current.onTouchStart(makeTouchEvent([{ clientX: 0, clientY: 0 }], "start"));
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 200, clientY: 0 }], "end"));
      // Second end without a start should do nothing
      result.current.onTouchEnd(makeTouchEvent([{ clientX: 400, clientY: 0 }], "end"));
    });

    expect(onRight).toHaveBeenCalledTimes(1);
  });
});
