import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HabitRow } from '@/components/habits/habit-row';
import type { HabitWithTodayStatus, Category } from '@/lib/db/types';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'card.streakDays': `${params?.count ?? 0} days`,
        'card.markComplete': 'Mark complete',
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

describe('HabitRow', () => {
  const makeHabit = (overrides: Partial<HabitWithTodayStatus> = {}): HabitWithTodayStatus => ({
    id: 'habit-1',
    user_id: 'user-1',
    name: 'Morning Run',
    description: null,
    category_id: 'cat-health',
    frequency: { type: 'daily' },
    status: 'active',
    current_streak: 5,
    best_streak: 10,
    paused_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_today: false,
    monthly_completion_rate: 75,
    ...overrides,
  });

  const defaultProps = {
    habit: makeHabit(),
    categories: mockCategories,
    onToggle: vi.fn().mockResolvedValue(undefined),
    onClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders checkbox', () => {
      render(<HabitRow {...defaultProps} />);
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
    });

    it('renders habit name', () => {
      render(<HabitRow {...defaultProps} />);
      expect(screen.getByText('Morning Run')).toBeInTheDocument();
    });

    it('renders category name from categories prop', () => {
      render(<HabitRow {...defaultProps} />);
      expect(screen.getByText('Health')).toBeInTheDocument();
    });

    it('renders streak count', () => {
      render(<HabitRow {...defaultProps} />);
      expect(screen.getByText('5 days')).toBeInTheDocument();
    });

    it('shows correct category when category_id changes', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ category_id: 'cat-wellness' })} />);
      expect(screen.getByText('Wellness')).toBeInTheDocument();
    });

    it('shows empty label when category_id is null', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ category_id: null })} />);
      // No category name should be displayed
      expect(screen.queryByText('Health')).not.toBeInTheDocument();
      expect(screen.queryByText('Wellness')).not.toBeInTheDocument();
    });
  });

  describe('checkbox state', () => {
    it('shows unchecked state when not completed today', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ completed_today: false })} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).not.toBeChecked();
    });

    it('shows checked state when completed today', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ completed_today: true })} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('dims habit name when completed today', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ completed_today: true })} />);
      const nameSpan = screen.getByText('Morning Run');
      expect(nameSpan.className).toContain('text-muted-foreground');
    });

    it('does not dim habit name when not completed', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ completed_today: false })} />);
      const nameSpan = screen.getByText('Morning Run');
      expect(nameSpan.className).not.toContain('text-muted-foreground');
    });

    it('disables checkbox when isToggling is true', () => {
      render(<HabitRow {...defaultProps} isToggling />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });
  });

  describe('fire emoji for streak', () => {
    it('does not show fire emoji when streak is less than 7', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ current_streak: 6 })} />);
      // Verify by checking the rendered output doesn't have the flame element
      const container = screen.getByText('6 days').parentElement;
      expect(container?.querySelector('svg')).toBeNull();
    });

    it('shows fire emoji when streak is 7', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ current_streak: 7 })} />);
      const container = screen.getByText('7 days').parentElement;
      expect(container?.querySelector('svg')).toBeInTheDocument();
    });

    it('shows fire emoji when streak is greater than 7', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ current_streak: 14 })} />);
      const container = screen.getByText('14 days').parentElement;
      expect(container?.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onToggle when checkbox is clicked', () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      render(<HabitRow {...defaultProps} onToggle={onToggle} />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(onToggle).toHaveBeenCalledWith('habit-1');
    });

    it('does not call onToggle when isToggling is true', () => {
      const onToggle = vi.fn().mockResolvedValue(undefined);
      render(<HabitRow {...defaultProps} onToggle={onToggle} isToggling />);

      fireEvent.click(screen.getByRole('checkbox'));

      expect(onToggle).not.toHaveBeenCalled();
    });

    it('calls onClick when name button is clicked', () => {
      const onClick = vi.fn();
      render(<HabitRow {...defaultProps} onClick={onClick} />);

      fireEvent.click(screen.getByText('Morning Run'));

      expect(onClick).toHaveBeenCalledWith('habit-1');
    });
  });
});
