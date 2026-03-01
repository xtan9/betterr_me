"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Audio — lazy-init AudioContext (NOT at module scope per Web Audio best practice)
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null;

/**
 * Play a short beep via Web Audio API.
 * AudioContext is lazily created on first call (requires prior user gesture).
 * Silently fails if audio is unavailable.
 */
export function playBeep(frequency = 440, durationMs = 200): void {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Resume if suspended (browsers suspend until user gesture)
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.3; // moderate volume

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + durationMs / 1000);
  } catch (err) {
    log.warn("Audio playback failed", { error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Rest Timer Hook
// ---------------------------------------------------------------------------

/** Auto-dismiss delay after beep (ms) */
const AUTO_DISMISS_MS = 3000;

/** Tick interval for countdown display refresh (ms) */
// 200ms provides smooth countdown display while keeping CPU usage low (5 ticks/sec)
const TICK_INTERVAL_MS = 200;

export interface UseRestTimerReturn {
  /** Seconds remaining (0 when inactive) */
  remaining: number;
  /** Whether timer is actively counting down */
  isActive: boolean;
  /** Start a countdown for the given number of seconds */
  start: (durationSeconds: number) => void;
  /** Adjust remaining time by delta seconds (clamped >= 0) */
  adjust: (deltaSeconds: number) => void;
  /** Skip / cancel the current rest timer */
  skip: () => void;
}

/**
 * Timestamp-based rest timer hook.
 *
 * Uses absolute `Date.now()` timestamps so the countdown stays accurate
 * across browser tab switches (visibility change) and JS event-loop delays.
 *
 * Plays an audio beep when the countdown reaches zero, then auto-dismisses
 * after a short delay.
 */
export function useRestTimer(): UseRestTimerReturn {
  const [endTime, setEndTime] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  // Ref to track whether we already beeped for the current timer cycle
  const hasBeeped = useRef(false);
  // Ref for the auto-dismiss timeout so we can clear it on skip/start
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Tick: recompute remaining from absolute timestamps
  // -----------------------------------------------------------------------
  const tick = useCallback(() => {
    setEndTime((currentEnd) => {
      if (currentEnd === null) {
        setRemaining(0);
        return null;
      }

      const now = Date.now();
      const diff = Math.max(0, Math.ceil((currentEnd - now) / 1000));
      setRemaining(diff);

      if (diff === 0 && !hasBeeped.current) {
        hasBeeped.current = true;
        playBeep();
      }

      return currentEnd;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Interval + visibilitychange
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (endTime === null) return;

    // Immediate tick on mount / endTime change
    tick();

    const interval = setInterval(tick, TICK_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [endTime, tick]);

  // -----------------------------------------------------------------------
  // Auto-dismiss after beep
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (endTime !== null && remaining === 0 && hasBeeped.current) {
      autoDismissRef.current = setTimeout(() => {
        setEndTime(null);
        setRemaining(0);
        hasBeeped.current = false;
      }, AUTO_DISMISS_MS);

      return () => {
        if (autoDismissRef.current) {
          clearTimeout(autoDismissRef.current);
          autoDismissRef.current = null;
        }
      };
    }
  }, [endTime, remaining]);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  const start = useCallback((durationSeconds: number) => {
    if (durationSeconds <= 0) return;
    hasBeeped.current = false;
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    const target = Date.now() + durationSeconds * 1000;
    setEndTime(target);
    setRemaining(durationSeconds);
  }, []);

  const adjust = useCallback((deltaSeconds: number) => {
    setEndTime((prev) => {
      if (prev === null) return null;
      const now = Date.now();
      const currentRemaining = Math.max(0, prev - now);
      const newRemaining = Math.max(0, currentRemaining + deltaSeconds * 1000);
      const newEnd = now + newRemaining;

      // If we extend back from 0, reset beep flag
      if (newRemaining > 0) {
        hasBeeped.current = false;
        if (autoDismissRef.current) {
          clearTimeout(autoDismissRef.current);
          autoDismissRef.current = null;
        }
      }

      return newEnd;
    });
  }, []);

  const skip = useCallback(() => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    hasBeeped.current = false;
    setEndTime(null);
    setRemaining(0);
  }, []);

  const isActive = endTime !== null;

  return { remaining, isActive, start, adjust, skip };
}
