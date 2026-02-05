import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitList } from '@/components/habits/habit-list';
import type { HabitWithTodayStatus } from '@/lib/db/types';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'title': 'My Habits',
        'newHabit': '+ New Habit',
        'searchPlaceholder': 'Search habits...',
        'tabs.active': 'Active',
        'tabs.paused': 'Paused',
        'tabs.archived': 'Archived',
        'showing': `Showing ${params?.count ?? 0} ${params?.status ?? ''} habits`,
        'noResults': `No habits matching "${params?.query ?? ''}"`,
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

// Mock HabitCard to simplify testing
vi.mock('@/components/habits/habit-card', () => ({
  HabitCard: ({ habit, onClick }: { habit: HabitWithTodayStatus; onClick: () => void }) => (
    <div data-testid={`habit-card-${habit.id}`} onClick={onClick}>
      {habit.name}
    </div>
  ),
}));

// Mock HabitEmptyState
vi.mock('@/components/habits/habit-empty-state', () => ({
  HabitEmptyState: ({ variant, searchQuery }: { variant: string; searchQuery?: string }) => (
    <div data-testid={`empty-state-${variant}`}>
      {variant === 'no_results' ? `No results for: ${searchQuery}` : `Empty: ${variant}`}
    </div>
  ),
}));

// Mock Skeleton
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// Mock useDebounce to make it synchronous for testing
vi.mock('@/lib/hooks/use-debounce', () => ({
  useDebounce: <T,>(value: T) => value, // Bypass debounce in tests
}));

describe('HabitList', () => {
  const makeHabit = (overrides: Partial<HabitWithTodayStatus> = {}): HabitWithTodayStatus => ({
    id: `habit-${Math.random().toString(36).slice(2)}`,
    user_id: 'user-1',
    name: 'Test Habit',
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

  const mockHabits = [
    makeHabit({ id: '1', name: 'Morning Run', status: 'active' }),
    makeHabit({ id: '2', name: 'Read Book', status: 'active' }),
    makeHabit({ id: '3', name: 'Meditate', status: 'paused', paused_at: '2026-01-15T00:00:00Z' }),
    makeHabit({ id: '4', name: 'Old Habit', status: 'archived' }),
  ];

  const defaultProps = {
    habits: mockHabits,
    onToggle: vi.fn(),
    onHabitClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the title', () => {
      render(<HabitList {...defaultProps} />);
      expect(screen.getByText('My Habits')).toBeInTheDocument();
    });

    it('renders status tabs', () => {
      render(<HabitList {...defaultProps} />);
      expect(screen.getByRole('tab', { name: /Active/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Paused/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Archived/i })).toBeInTheDocument();
    });

    it('renders search input', () => {
      render(<HabitList {...defaultProps} />);
      expect(screen.getByPlaceholderText('Search habits...')).toBeInTheDocument();
    });

    it('renders active habits by default', () => {
      render(<HabitList {...defaultProps} />);
      expect(screen.getByTestId('habit-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('habit-card-2')).toBeInTheDocument();
      expect(screen.queryByTestId('habit-card-3')).not.toBeInTheDocument();
      expect(screen.queryByTestId('habit-card-4')).not.toBeInTheDocument();
    });
  });

  describe('filtering by tabs', () => {
    it('shows paused habits when paused tab is clicked', async () => {
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} />);

      await user.click(screen.getByRole('tab', { name: /Paused/i }));

      await waitFor(() => {
        expect(screen.getByTestId('habit-card-3')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('habit-card-1')).not.toBeInTheDocument();
    });

    it('shows archived habits when archived tab is clicked', async () => {
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} />);

      await user.click(screen.getByRole('tab', { name: /Archived/i }));

      await waitFor(() => {
        expect(screen.getByTestId('habit-card-4')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('habit-card-1')).not.toBeInTheDocument();
    });
  });

  describe('filtering by search', () => {
    it('filters habits by search query', async () => {
      render(<HabitList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search habits...');
      fireEvent.change(searchInput, { target: { value: 'Morning' } });

      await waitFor(() => {
        expect(screen.queryByTestId('habit-card-2')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('habit-card-1')).toBeInTheDocument();
    });

    it('shows no results empty state when search has no matches', async () => {
      render(<HabitList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search habits...');
      fireEvent.change(searchInput, { target: { value: 'xyz' } });

      await waitFor(() => {
        expect(screen.getByTestId('empty-state-no_results')).toBeInTheDocument();
      });
    });
  });

  describe('empty states', () => {
    it('shows no_habits empty state when no habits exist', () => {
      render(<HabitList {...defaultProps} habits={[]} />);
      expect(screen.getByTestId('empty-state-no_habits')).toBeInTheDocument();
    });

    it('shows no_paused empty state when no paused habits', async () => {
      const user = userEvent.setup();
      const habitsWithoutPaused = mockHabits.filter(h => h.status !== 'paused');
      render(<HabitList {...defaultProps} habits={habitsWithoutPaused} />);

      await user.click(screen.getByRole('tab', { name: /Paused/i }));

      await waitFor(() => {
        expect(screen.getByTestId('empty-state-no_paused')).toBeInTheDocument();
      });
    });

    it('shows no_archived empty state when no archived habits', async () => {
      const user = userEvent.setup();
      const habitsWithoutArchived = mockHabits.filter(h => h.status !== 'archived');
      render(<HabitList {...defaultProps} habits={habitsWithoutArchived} />);

      await user.click(screen.getByRole('tab', { name: /Archived/i }));

      await waitFor(() => {
        expect(screen.getByTestId('empty-state-no_archived')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows skeleton cards when loading', () => {
      render(<HabitList {...defaultProps} isLoading />);
      const skeletons = screen.getAllByTestId('skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('does not show habits when loading', () => {
      render(<HabitList {...defaultProps} isLoading />);
      expect(screen.queryByTestId('habit-card-1')).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onHabitClick when a habit card is clicked', () => {
      const onHabitClick = vi.fn();
      render(<HabitList {...defaultProps} onHabitClick={onHabitClick} />);

      fireEvent.click(screen.getByTestId('habit-card-1'));
      expect(onHabitClick).toHaveBeenCalledWith('1');
    });
  });

  describe('tab counts', () => {
    it('shows count badges on tabs', () => {
      render(<HabitList {...defaultProps} />);
      // Active: 2, Paused: 1, Archived: 1
      expect(screen.getByText(/Active.*\(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Paused.*\(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Archived.*\(1\)/i)).toBeInTheDocument();
    });
  });
});
