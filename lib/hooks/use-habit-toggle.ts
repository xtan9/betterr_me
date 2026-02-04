export function useHabitToggle() {
  const toggleHabit = async (
    habitId: string,
    date?: string,
    options?: {
      onOptimisticUpdate?: () => void;
      onSuccess?: (data: { currentStreak: number; bestStreak: number; completed: boolean }) => void;
      onError?: () => void;
    }
  ) => {
    options?.onOptimisticUpdate?.();

    try {
      const res = await fetch(`/api/habits/${habitId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error);
      }

      const data = await res.json();
      options?.onSuccess?.(data);
      return data;
    } catch (error) {
      options?.onError?.();
      throw error;
    }
  };

  return { toggleHabit };
}
