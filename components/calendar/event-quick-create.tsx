"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

interface EventQuickCreateProps {
  /** Whether the popover is open */
  isOpen: boolean;
  /** Close the popover */
  onClose: () => void;
  /** Pre-filled date (YYYY-MM-DD) */
  date: string;
  /** Pre-filled start time (HH:MM) */
  startTime: string;
  /** Pre-filled end time (HH:MM), from drag duration or default +30min */
  endTime: string;
  /** Called when "More options" is clicked, passing current title */
  onMoreOptions: (title: string) => void;
  /** Called after successful save to refresh events */
  onSaved: () => void;
  /** Position coordinates for the popover anchor */
  anchorPosition: { x: number; y: number };
}

export function EventQuickCreate({
  isOpen,
  onClose,
  date,
  startTime,
  endTime,
  onMoreOptions,
  onSaved,
  anchorPosition,
}: EventQuickCreateProps) {
  const t = useTranslations("calendar");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(anchorPosition);

  // Adjust position to keep popover within viewport
  useEffect(() => {
    if (!isOpen || !popoverRef.current) return;

    const rect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = anchorPosition.x;
    let y = anchorPosition.y;

    // Shift left if overflowing right edge
    if (x + rect.width > viewportWidth - 16) {
      x = viewportWidth - rect.width - 16;
    }
    // Shift up if overflowing bottom edge
    if (y + rect.height > viewportHeight - 16) {
      y = viewportHeight - rect.height - 16;
    }
    // Ensure not negative
    x = Math.max(8, x);
    y = Math.max(8, y);

    setAdjustedPosition({ x, y });
  }, [isOpen, anchorPosition]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure popover is rendered
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Click-outside handler
  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          start_date: date,
          start_time: startTime + ":00",
          end_date: date,
          end_time: endTime + ":00",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Calendar quick-create failed:", data);
        setError(data.error || t("quickCreate.saveFailed"));
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to quick-create calendar event:", err);
      setError(t("quickCreate.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [title, date, startTime, endTime, onSaved, onClose, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !saving) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [handleSubmit, saving, onClose],
  );

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="fixed bg-popover border border-border rounded-lg shadow-lg p-3 w-64 z-50"
      style={{ top: adjustedPosition.y, left: adjustedPosition.x }}
      role="dialog"
      aria-label={t("quickCreate.titlePlaceholder")}
    >
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("quickCreate.titlePlaceholder")}
        className="w-full border-b border-border bg-transparent text-sm pb-2 mb-2 outline-none placeholder:text-muted-foreground"
        disabled={saving}
        autoFocus
      />

      <div className="text-xs text-muted-foreground mb-2">
        {startTime} &ndash; {endTime}
      </div>

      {error && (
        <div className="text-xs text-destructive mb-2">{error}</div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => onMoreOptions(title)}
        >
          {t("quickCreate.moreOptions")}
        </button>
        {saving && (
          <span className="text-xs text-muted-foreground">
            {t("quickCreate.saving")}
          </span>
        )}
      </div>
    </div>
  );
}
