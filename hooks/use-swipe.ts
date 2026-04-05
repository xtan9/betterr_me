"use client";

import { useRef, useCallback } from "react";

interface UseSwipeOptions {
  threshold?: number;
}

export function useSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  options?: UseSwipeOptions,
) {
  const threshold = options?.threshold ?? 50;
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    },
    [],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;

      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = e.changedTouches[0].clientY - touchStart.current.y;

      touchStart.current = null;

      // Only trigger if horizontal movement is dominant (1.5x vertical)
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) {
          onSwipeRight();
        } else {
          onSwipeLeft();
        }
      }
    },
    [onSwipeLeft, onSwipeRight, threshold],
  );

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}
