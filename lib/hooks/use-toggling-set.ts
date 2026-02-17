import { useState, useCallback } from "react";

export function useTogglingSet() {
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const isToggling = useCallback(
    (id: string) => togglingIds.has(id),
    [togglingIds],
  );

  const startToggling = useCallback((id: string) => {
    setTogglingIds((prev) => new Set(prev).add(id));
  }, []);

  const stopToggling = useCallback((id: string) => {
    setTogglingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  return { togglingIds, isToggling, startToggling, stopToggling };
}
