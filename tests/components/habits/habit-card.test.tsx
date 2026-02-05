import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitCard } from '@/components/habits/habit-card';
import { HabitRow } from '@/components/habits/habit-row';
import type { HabitWithTodayStatus } from '@/lib/db/types';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        // Card translations
        'card.currentStreak': 'Current',
        'card.bestStreak': 'Best',
        'card.streakDays': `${params?.count ?? 0} days`,
        'card.thisMonth': `${params?.percent ?? 0}% this month`,
        'card.completedToday': 'Completed today',
        // Category translations
        'categories.health': 'Health',
        'categories.wellness': 'Wellness',
        'categories.learning': 'Learning',
        'categories.productivity': 'Productivity',
        'categories.other': 'Other',
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

// Mock lucide-react icons (use importOriginal to keep shadcn internals like CheckIcon working)
vi.mock('lucide-react', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    Heart: (props: Record<string, unknown>) => <span data-testid="icon-heart" {...props} />,
    Brain: (props: Record<string, unknown>) => <span data-testid="icon-brain" {...props} />,
    BookOpen: (props: Record<string, unknown>) => <span data-testid="icon-book" {...props} />,
    Zap: (props: Record<string, unknown>) => <span data-testid="icon-zap" {...props} />,
    MoreHorizontal: (props: Record<string, unknown>) => <span data-testid="icon-more" {...props} />,
    Flame: (props: Record<string, unknown>) => <span data-testid="icon-flame" {...props} />,
  };
});

const baseHabit: HabitWithTodayStatus = {
  id: 'habit-1',
  user_id: 'user-1',
  name: 'Morning Run',
  description: 'Run for 30 minutes',
  category: 'health',
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 23,
  best_streak: 30,
  paused_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  completed_today: false,
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
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('Morning Run')).toBeInTheDocument();
    });

    it('renders frequency label', () => {
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText(/Every day/)).toBeInTheDocument();
    });

    it('renders category badge', () => {
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText(/Health/)).toBeInTheDocument();
    });

    it('renders current and best streak', () => {
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('23 days')).toBeInTheDocument();
      expect(screen.getByText('30 days')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('Best')).toBeInTheDocument();
    });

    it('shows fire icon when streak >= 7', () => {
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByTestId('icon-flame')).toBeInTheDocument();
    });

    it('does not show fire icon when streak < 7', () => {
      const lowStreak = { ...baseHabit, current_streak: 3 };
      render(<HabitCard habit={lowStreak} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.queryByTestId('icon-flame')).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClick when card is clicked', async () => {
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      await user.click(screen.getByText('Morning Run'));
      expect(mockOnClick).toHaveBeenCalledWith('habit-1');
    });

    it('calls onToggle when checkbox is clicked', async () => {
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      expect(mockOnToggle).toHaveBeenCalledWith('habit-1');
    });

    it('checkbox does not trigger onClick', async () => {
      render(<HabitCard habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('shows checked state when completed_today is true', () => {
      const completedHabit = { ...baseHabit, completed_today: true };
      render(<HabitCard habit={completedHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
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
      render(<HabitRow habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('Morning Run')).toBeInTheDocument();
    });

    it('renders category label', () => {
      render(<HabitRow habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('Health')).toBeInTheDocument();
    });

    it('renders streak with fire icon for high streaks', () => {
      render(<HabitRow habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByText('23 days')).toBeInTheDocument();
      expect(screen.getByTestId('icon-flame')).toBeInTheDocument();
    });

    it('renders checkbox', () => {
      render(<HabitRow habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('checkbox is checked when completed_today is true', () => {
      const completed = { ...baseHabit, completed_today: true };
      render(<HabitRow habit={completed} onToggle={mockOnToggle} onClick={mockOnClick} />);
      expect(screen.getByRole('checkbox')).toBeChecked();
    });
  });

  describe('interactions', () => {
    it('calls onToggle when row is clicked', async () => {
      render(<HabitRow habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      await user.click(screen.getByRole('checkbox'));
      expect(mockOnToggle).toHaveBeenCalledWith('habit-1');
    });

    it('calls onClick when habit name is clicked', async () => {
      render(<HabitRow habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} />);
      await user.click(screen.getByText('Morning Run'));
      expect(mockOnClick).toHaveBeenCalledWith('habit-1');
    });

    it('does not call onToggle when toggling is in progress', async () => {
      render(
        <HabitRow habit={baseHabit} onToggle={mockOnToggle} onClick={mockOnClick} isToggling />
      );
      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);
      expect(mockOnToggle).not.toHaveBeenCalled();
    });
  });
});
