"use client";

import { useEffect } from "react";

interface KeyboardShortcutHandlers {
  onDayView: () => void;
  onWeekView: () => void;
  onMonthView: () => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onQuickCreate: () => void;
  onNewEvent: () => void;
  onSearch: () => void;
  onEscape: () => void;
  /** When true, only Esc is active (popover/dialog is open) */
  isOverlayOpen?: boolean;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Suppress shortcuts when focus is in text inputs, textareas, or contenteditable
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (
        tagName === "input" ||
        tagName === "textarea" ||
        target.isContentEditable
      ) {
        // Allow Esc even in inputs
        if (e.key === "Escape") {
          handlers.onEscape();
          return;
        }
        return;
      }

      // When overlay is open, only Esc works
      if (handlers.isOverlayOpen) {
        if (e.key === "Escape") {
          handlers.onEscape();
        }
        return;
      }

      switch (e.key) {
        case "d":
        case "D":
          e.preventDefault();
          handlers.onDayView();
          break;
        case "w":
        case "W":
          e.preventDefault();
          handlers.onWeekView();
          break;
        case "m":
        case "M":
          e.preventDefault();
          handlers.onMonthView();
          break;
        case "t":
        case "T":
          e.preventDefault();
          handlers.onToday();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handlers.onPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          handlers.onNext();
          break;
        case "c":
        case "C":
          e.preventDefault();
          handlers.onQuickCreate();
          break;
        case "n":
        case "N":
          e.preventDefault();
          handlers.onNewEvent();
          break;
        case "/":
          e.preventDefault();
          handlers.onSearch();
          break;
        case "Escape":
          handlers.onEscape();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
