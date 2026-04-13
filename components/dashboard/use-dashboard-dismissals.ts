import { useState, useCallback } from "react";

function readLocalStorageSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function readLocalStorageBool(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function useDashboardDismissals(today: string, dismissKey: string) {
  const [dismissedAbsenceIds, setDismissedAbsenceIds] = useState<Set<string>>(() =>
    readLocalStorageSet(`absence-dismissed-${today}`),
  );

  const handleDismissAbsence = useCallback((habitId: string) => {
    setDismissedAbsenceIds(prev => {
      const next = new Set(prev);
      next.add(habitId);
      localStorage.setItem(`absence-dismissed-${today}`, JSON.stringify([...next]));
      return next;
    });
  }, [today]);

  const [dismissedMotivation, setDismissedMotivation] = useState<boolean>(() =>
    readLocalStorageBool(`motivation-dismissed-${today}`),
  );

  const handleDismissMotivation = useCallback(() => {
    setDismissedMotivation(true);
    try {
      localStorage.setItem(`motivation-dismissed-${today}`, "true");
    } catch {
      // Storage unavailable (private browsing, quota exceeded)
    }
  }, [today]);

  const [dismissedMilestoneIds, setDismissedMilestoneIds] = useState<Set<string>>(() =>
    readLocalStorageSet(`milestones-dismissed-${today}`),
  );

  const handleDismissMilestone = useCallback((milestoneId: string) => {
    setDismissedMilestoneIds(prev => {
      const next = new Set(prev);
      next.add(milestoneId);
      try {
        localStorage.setItem(`milestones-dismissed-${today}`, JSON.stringify([...next]));
      } catch {
        // Storage unavailable (private browsing, quota exceeded)
      }
      return next;
    });
  }, [today]);

  const [insightDismissed, setInsightDismissed] = useState(() =>
    readLocalStorageBool(dismissKey),
  );

  const handleDismissInsight = useCallback(() => {
    setInsightDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(dismissKey, "true");
    }
  }, [dismissKey]);

  return {
    dismissedAbsenceIds,
    handleDismissAbsence,
    dismissedMotivation,
    handleDismissMotivation,
    dismissedMilestoneIds,
    handleDismissMilestone,
    insightDismissed,
    handleDismissInsight,
  };
}
