import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitCard } from '@/components/habits/habit-card';
import { HabitRow } from '@/components/habits/habit-row';
import type { HabitWithTodayStatus, Category } from '@/lib/db/types';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        // Card translations
        'card.currentStreak': 'Current',
        'card.bestStreak': 'Best',
        'card.streakDays': `${params?.count ?? 0} days`,
        'card.streakWeeks': `${params?.count ?? 0} weeks`,
        'card.thisMonth': `${params?.percent ?? 0}% this month`,
        'card.completedToday': 'Completed today',
        'card.markComplete': 'Mark complete',
        // Frequency translations
        'frequency.daily': 'Every day',
        'frequency.weekdays': 'Mon – Fri',
        'frequency.weekly': 'Once a week',
        'frequency.timesPerWeek': `${params?.count ?? 0} times/week`,
        'frequency.custom': 'Custom days',
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

// Mock lucide-react icons (use importOriginal to keep shadcn internals like CheckIcon working)
vi.mock('lucide-react', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    Tag: (props: Record<string, unknown>) => <span data-testid="icon-tag" {...props} />,
    Flame: (props: Record<string, unknown>) => <span data-testid="icon-flame" {...props} />,
  };
});

const mockCategories: Category[] = [
  {
    id: 'cat-health',
    user_id: 'user-1',
    name: 'Health',
    color: 'red',
    icon: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'cat-wellness',
    user_id: 'user-1',
    name: 'Wellness',
    color: 'blue',
    icon: null,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const baseHabit: HabitWithTodayStatus = {
  id: 'habit-1',
  user_id: 'user-1',
  name: 'Morning Run',
  description: 'Run for 30 minutes',
  category: 'health',
  category_id: 'cat-health',
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 23,
  best_streak: 30,
  paused_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  completed_today: false,
  monthly_completion_rate: 75,
};

describe('HabitCard', () => {
  const mockOnToggle = vi.fn();
  const mockOnClick = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnToggle.mockResolvedValue(undefined);
  });

  describe('rendering', () => {
    it('renders habit name', () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('Morning Run')).toBeInTheDocument();
    });

    it('renders frequency label', () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText(/Every day/)).toBeInTheDocument();
    });

    it('renders category name from categories prop', () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText(/Health/)).toBeInTheDocument();
    });

    it('renders current and best streak', () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('23 days')).toBeInTheDocument();
      expect(screen.getByText('30 days')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('Best')).toBeInTheDocument();
    });

    it('shows fire icon when streak >= 7', () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByTestId('icon-flame')).toBeInTheDocument();
    });

    it('does not show fire icon when streak < 7', () => {
      const lowStreak = { ...baseHabit, current_streak: 3 };
      render(<HabitCard habit={lowStreak} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.queryByTestId('icon-flame')).not.toBeInTheDocument();
    });

    it('displays streak in weeks for weekly frequency habits', () => {
      const weeklyHabit: HabitWithTodayStatus = {
        ...baseHabit,
        frequency: { type: 'weekly' },
        current_streak: 4,
        best_streak: 8,
      };
      render(<HabitCard habit={weeklyHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('4 weeks')).toBeInTheDocument();
      expect(screen.getByText('8 weeks')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClick when card is clicked', async () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      await user.click(screen.getByText('Morning Run'));
      expect(mockOnClick).toHaveBeenCalledWith('habit-1');
    });

    it('calls onToggle when checkbox is clicked', async () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      expect(mockOnToggle).toHaveBeenCalledWith('habit-1');
    });

    it('checkbox does not trigger onClick', async () => {
      render(<HabitCard habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('shows checked state when completed_today is true', () => {
      const completedHabit = { ...baseHabit, completed_today: true };
      render(<HabitCard habit={completedHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });
  });
});

describe('HabitRow', () => {
  const mockOnToggle = vi.fn();
  const mockOnClick = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnToggle.mockResolvedValue(undefined);
  });

  describe('rendering', () => {
    it('renders habit name', () => {
      render(<HabitRow habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('Morning Run')).toBeInTheDocument();
    });

    it('renders category name from categories prop', () => {
      render(<HabitRow habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('Health')).toBeInTheDocument();
    });

    it('renders streak with fire icon for high streaks', () => {
      render(<HabitRow habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('23 days')).toBeInTheDocument();
      expect(screen.getByTestId('icon-flame')).toBeInTheDocument();
    });

    it('renders checkbox', () => {
      render(<HabitRow habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('displays streak in weeks for times_per_week frequency in HabitRow', () => {
      const tpwHabit: HabitWithTodayStatus = {
        ...baseHabit,
        frequency: { type: 'times_per_week', count: 3 },
        current_streak: 6,
      };
      render(<HabitRow habit={tpwHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('6 weeks')).toBeInTheDocument();
    });

    it('checkbox is checked when completed_today is true', () => {
      const completed = { ...baseHabit, completed_today: true };
      render(<HabitRow habit={completed} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
  });

  describe('interactions', () => {
    it('calls onToggle when row is clicked', async () => {
      render(<HabitRow habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      await user.click(screen.getByRole('checkbox'));
      expect(mockOnToggle).toHaveBeenCalledWith('habit-1');
    });

    it('calls onClick when habit name is clicked', async () => {
      render(<HabitRow habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} />);
      await user.click(screen.getByText('Morning Run'));
      expect(mockOnClick).toHaveBeenCalledWith('habit-1');
    });

    it('does not call onToggle when toggling is in progress', async () => {
      render(
        <HabitRow habit={baseHabit} categories={mockCategories} onToggle={mockOnToggle} onClick={mockOnClick} isToggling />
      );
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      expect(mockOnToggle).not.toHaveBeenCalled();
    });
  });
});
