import type { HabitLog } from '@/lib/db/types';

export function makeLog(date: string, completed: boolean): HabitLog {
  return {
    id: `log-${date}`,
    habit_id: 'habit-1',
    user_id: 'user-1',
    logged_date: date,
    completed,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
  };
}
