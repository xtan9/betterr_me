import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HabitRow } from '@/components/habits/habit-row';
import type { HabitWithTodayStatus } from '@/lib/db/types';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'card.streakDays': `${params?.count ?? 0} days`,
        'categories.health': 'Health',
        'categories.wellness': 'Wellness',
        'categories.productivity': 'Productivity',
        'categories.learning': 'Learning',
        'categories.creativity': 'Creativity',
        'categories.social': 'Social',
        'categories.mindfulness': 'Mindfulness',
        'categories.other': 'Other',
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

describe('HabitRow', () => {
  const makeHabit = (overrides: Partial<HabitWithTodayStatus> = {}): HabitWithTodayStatus => ({
    id: 'habit-1',
    user_id: 'user-1',
    name: 'Morning Run',
    description: null,
    category: 'health',
    frequency: { type: 'daily' },
    status: 'active',
    current_streak: 5,
    best_streak: 10,
    paused_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_today: false,
    ...overrides,
  });

  const defaultProps = {
    habit: makeHabit(),
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

    it('renders category label', () => {
      render(<HabitRow {...defaultProps} />);
      expect(screen.getByText('Health')).toBeInTheDocument();
    });

    it('renders streak count', () => {
      render(<HabitRow {...defaultProps} />);
      expect(screen.getByText('5 days')).toBeInTheDocument();
    });

    it('capitalizes category correctly', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ category: 'wellness' })} />);
      expect(screen.getByText('Wellness')).toBeInTheDocument();
    });

    it('shows "Other" when category is null', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ category: null })} />);
      expect(screen.getByText('Other')).toBeInTheDocument();
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

    it('disables checkbox when isToggling is true', () => {
      render(<HabitRow {...defaultProps} isToggling />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
    });
  });

  describe('fire emoji for streak', () => {
    it('does not show fire emoji when streak is less than 7', () => {
      render(<HabitRow {...defaultProps} habit={makeHabit({ current_streak: 6 })} />);
      expect(screen.queryByTestId('flame-icon')).not.toBeInTheDocument();
      // Also verify by checking the rendered output doesn't have the flame element
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
