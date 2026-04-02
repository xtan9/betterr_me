import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

function createHandlers() {
  return {
    onDayView: vi.fn(),
    onWeekView: vi.fn(),
    onMonthView: vi.fn(),
    onToday: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onQuickCreate: vi.fn(),
    onNewEvent: vi.fn(),
    onSearch: vi.fn(),
    onEscape: vi.fn(),
    isOverlayOpen: false as boolean | undefined,
  };
}

function pressKey(key: string) {
  // Dispatch from body so event.target has a valid tagName (document itself has no tagName in jsdom)
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("useKeyboardShortcuts", () => {
  it("fires onDayView when D is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("d");
    expect(handlers.onDayView).toHaveBeenCalledOnce();
  });

  it("fires onWeekView when W is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("w");
    expect(handlers.onWeekView).toHaveBeenCalledOnce();
  });

  it("fires onMonthView when M is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("m");
    expect(handlers.onMonthView).toHaveBeenCalledOnce();
  });

  it("fires onToday when T is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("t");
    expect(handlers.onToday).toHaveBeenCalledOnce();
  });

  it("fires onPrev when ArrowLeft is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("ArrowLeft");
    expect(handlers.onPrev).toHaveBeenCalledOnce();
  });

  it("fires onNext when ArrowRight is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("ArrowRight");
    expect(handlers.onNext).toHaveBeenCalledOnce();
  });

  it("fires onQuickCreate when C is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("c");
    expect(handlers.onQuickCreate).toHaveBeenCalledOnce();
  });

  it("fires onNewEvent when N is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("n");
    expect(handlers.onNewEvent).toHaveBeenCalledOnce();
  });

  it("fires onSearch when / is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("/");
    expect(handlers.onSearch).toHaveBeenCalledOnce();
  });

  it("fires onEscape when Escape is pressed", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));
    pressKey("Escape");
    expect(handlers.onEscape).toHaveBeenCalledOnce();
  });

  it("suppresses non-Escape shortcuts when focus is in an input", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "d", bubbles: true });
    Object.defineProperty(event, "target", { value: input });
    document.dispatchEvent(event);

    expect(handlers.onDayView).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("allows Escape when focus is in an input", () => {
    const handlers = createHandlers();
    renderHook(() => useKeyboardShortcuts(handlers));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(event, "target", { value: input });
    document.dispatchEvent(event);

    expect(handlers.onEscape).toHaveBeenCalledOnce();

    document.body.removeChild(input);
  });

  it("only fires Escape when isOverlayOpen is true", () => {
    const handlers = createHandlers();
    handlers.isOverlayOpen = true;
    renderHook(() => useKeyboardShortcuts(handlers));

    pressKey("d");
    pressKey("w");
    pressKey("Escape");

    expect(handlers.onDayView).not.toHaveBeenCalled();
    expect(handlers.onWeekView).not.toHaveBeenCalled();
    expect(handlers.onEscape).toHaveBeenCalledOnce();
  });
});
