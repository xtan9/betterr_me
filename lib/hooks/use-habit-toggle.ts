export async function setHabitCompletion(
  habitId: string,
  completed: boolean,
  date?: string,
) {
  const response = await fetch(`/api/habits/${habitId}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date, completed }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return response.json();
}

export function useHabitToggle() {
  const toggleHabit = async (
    habitId: string,
    completed: boolean,
    date?: string,
    options?: {
      onOptimisticUpdate?: () => void;
      onSuccess?: (data: { currentStreak: number; bestStreak: number; completed: boolean }) => void;
      onError?: () => void;
    }
  ) => {
    options?.onOptimisticUpdate?.();

    try {
      const data = await setHabitCompletion(habitId, completed, date);
      options?.onSuccess?.(data);
      return data;
    } catch (error) {
      options?.onError?.();
      throw error;
    }
  };

  return { toggleHabit };
}
