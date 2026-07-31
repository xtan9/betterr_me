import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';
import userEvent from '@testing-library/user-event';
import { HabitList } from '@/components/habits/habit-list';
import type { HabitWithTodayStatus } from '@/lib/db/types';

expect.extend(axeMatchers);

// Mock sonner toast
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// Mock useCategories so no SWR network calls happen
vi.mock('@/lib/hooks/use-categories', () => ({
  useCategories: () => ({ categories: [], error: null, isLoading: false, mutate: vi.fn() }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'title': 'My Habits',
        'newHabit': '+ New Habit',
        'searchPlaceholder': 'Search habits...',
        'tabs.active': 'Active',
        'tabs.paused': 'Paused',
        'tabs.formed': 'Formed',
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

// Mock FormedHabitCard (used in Formed tab)
vi.mock('@/components/habits/formed-habit-card', () => ({
  FormedHabitCard: ({
    habit,
    onReactivate,
    onDelete,
  }: {
    habit: HabitWithTodayStatus;
    onReactivate: (id: string) => void;
    onDelete: (id: string) => void;
  }) => (
    <div data-testid={`habit-card-${habit.id}`}>
      {habit.name}
      <button data-testid={`reactivate-btn-${habit.id}`} onClick={() => onReactivate(habit.id)}>
        reactivate
      </button>
      <button data-testid={`delete-btn-${habit.id}`} onClick={() => onDelete(habit.id)}>
        delete
      </button>
    </div>
  ),
}));

// Mock GraduationNudgeBanner — expose onGraduate/onDismiss
vi.mock('@/components/habits/graduation-nudge-banner', () => ({
  GraduationNudgeBanner: ({
    habitId,
    onGraduate,
    onDismiss,
  }: {
    habitId: string;
    onGraduate: (id: string) => void;
    onDismiss: (id: string) => void;
  }) => (
    <div data-testid={`graduation-banner-${habitId}`}>
      <button data-testid={`graduate-btn-${habitId}`} onClick={() => onGraduate(habitId)}>
        graduate
      </button>
      <button data-testid={`dismiss-btn-${habitId}`} onClick={() => onDismiss(habitId)}>
        dismiss
      </button>
    </div>
  ),
}));

// Mock dialogs — expose open state and confirm/cancel hooks
vi.mock('@/components/habits/graduate-dialog', () => ({
  GraduateDialog: ({
    open,
    onOpenChange,
    habitName,
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    habitName: string;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="graduate-dialog">
        <span>{habitName}</span>
        <button data-testid="graduate-confirm" onClick={onConfirm}>confirm</button>
        <button data-testid="graduate-cancel" onClick={() => onOpenChange(false)}>cancel</button>
      </div>
    ) : null,
}));
vi.mock('@/components/habits/reactivate-dialog', () => ({
  ReactivateDialog: ({
    open,
    onOpenChange,
    habitName,
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    habitName: string;
    bestStreak: number;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="reactivate-dialog">
        <span>{habitName}</span>
        <button data-testid="reactivate-confirm" onClick={onConfirm}>confirm</button>
        <button data-testid="reactivate-cancel" onClick={() => onOpenChange(false)}>cancel</button>
      </div>
    ) : null,
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
    category_id: null,
    frequency: { type: 'daily' },
    status: 'active',
    current_streak: 5,
    best_streak: 10,
    paused_at: null,
    graduated_at: null,
    graduated_streak: null,
    nudge_dismissed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_today: false,
    monthly_completion_rate: 75,
    graduation_eligible: false,
    ...overrides,
  });

  const mockHabits = [
    makeHabit({ id: '1', name: 'Morning Run', status: 'active' }),
    makeHabit({ id: '2', name: 'Read Book', status: 'active' }),
    makeHabit({ id: '3', name: 'Meditate', status: 'paused', paused_at: '2026-01-15T00:00:00Z' }),
    makeHabit({ id: '4', name: 'Old Habit', status: 'formed' }),
  ];

  const defaultProps = {
    habits: mockHabits,
    onToggle: vi.fn(),
    onHabitClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    toastSuccess.mockClear();
    toastError.mockClear();
    // Reset fetch between tests
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('rendering', () => {
    it('renders status tabs', () => {
      render(<HabitList {...defaultProps} />);
      expect(screen.getByRole('tab', { name: /Active/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Paused/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Formed/i })).toBeInTheDocument();
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

    it('shows formed habits when formed tab is clicked', async () => {
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));

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

    it('shows no_formed empty state when no formed habits', async () => {
      const user = userEvent.setup();
      const habitsWithoutFormed = mockHabits.filter(h => h.status !== 'formed');
      render(<HabitList {...defaultProps} habits={habitsWithoutFormed} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));

      await waitFor(() => {
        expect(screen.getByTestId('empty-state-no_formed')).toBeInTheDocument();
      });
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
      // Active: 2, Paused: 1, Formed: 1
      expect(screen.getByText(/Active.*\(2\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Paused.*\(1\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Formed.*\(1\)/i)).toBeInTheDocument();
    });
  });

  describe('search behavior', () => {
    it('clears the search query when switching tabs', async () => {
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search habits...') as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'Morning' } });
      expect(searchInput.value).toBe('Morning');

      await user.click(screen.getByRole('tab', { name: /Paused/i }));
      await waitFor(() => {
        expect(
          (screen.getByPlaceholderText('Search habits...') as HTMLInputElement).value
        ).toBe('');
      });
    });
  });

  describe('graduation nudge flow', () => {
    const eligibleHabits = [
      makeHabit({ id: 'g1', name: 'Water', status: 'active', graduation_eligible: true }),
    ];

    it('renders the nudge banner for graduation_eligible active habits', () => {
      render(<HabitList {...defaultProps} habits={eligibleHabits} />);
      expect(screen.getByTestId('graduation-banner-g1')).toBeInTheDocument();
    });

    it('opens the graduate dialog when the user clicks graduate', async () => {
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} habits={eligibleHabits} />);

      await user.click(screen.getByTestId('graduate-btn-g1'));
      const dialog = screen.getByTestId('graduate-dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveTextContent('Water');
    });

    it('confirms graduation — fires POST, shows success toast, and calls onMutate', async () => {
      const onMutate = vi.fn();
      const user = userEvent.setup();
      render(
        <HabitList {...defaultProps} habits={eligibleHabits} onMutate={onMutate} />
      );

      await user.click(screen.getByTestId('graduate-btn-g1'));
      await user.click(screen.getByTestId('graduate-confirm'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/habits/g1/graduate',
          expect.objectContaining({ method: 'POST' })
        );
      });
      expect(toastSuccess).toHaveBeenCalled();
      expect(onMutate).toHaveBeenCalled();
    });

    it('surfaces error toast when graduate API fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'boom' }),
          })
        )
      );
      const onMutate = vi.fn();
      const user = userEvent.setup();
      render(
        <HabitList {...defaultProps} habits={eligibleHabits} onMutate={onMutate} />
      );
      await user.click(screen.getByTestId('graduate-btn-g1'));
      await user.click(screen.getByTestId('graduate-confirm'));

      await waitFor(() => {
        expect(toastError).toHaveBeenCalled();
      });
      expect(onMutate).toHaveBeenCalled();
    });

    it('closes the graduate dialog when onOpenChange(false) fires', async () => {
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} habits={eligibleHabits} />);

      await user.click(screen.getByTestId('graduate-btn-g1'));
      expect(screen.getByTestId('graduate-dialog')).toBeInTheDocument();

      await user.click(screen.getByTestId('graduate-cancel'));
      await waitFor(() => {
        expect(screen.queryByTestId('graduate-dialog')).not.toBeInTheDocument();
      });
    });

    it('dismisses the nudge via POST and calls onMutate', async () => {
      const onMutate = vi.fn();
      const user = userEvent.setup();
      render(
        <HabitList {...defaultProps} habits={eligibleHabits} onMutate={onMutate} />
      );

      await user.click(screen.getByTestId('dismiss-btn-g1'));
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/habits/g1/dismiss-graduation-nudge',
          expect.objectContaining({ method: 'POST' })
        );
      });
      expect(onMutate).toHaveBeenCalled();
    });

    it('toasts error when dismiss-nudge fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          })
        )
      );
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} habits={eligibleHabits} onMutate={vi.fn()} />);

      await user.click(screen.getByTestId('dismiss-btn-g1'));
      await waitFor(() => {
        expect(toastError).toHaveBeenCalled();
      });
    });
  });

  describe('reactivate flow (formed tab)', () => {
    it('opens reactivate dialog and confirms — fires POST and success toast', async () => {
      const onMutate = vi.fn();
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} onMutate={onMutate} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));
      await user.click(await screen.findByTestId('reactivate-btn-4'));

      expect(screen.getByTestId('reactivate-dialog')).toBeInTheDocument();
      await user.click(screen.getByTestId('reactivate-confirm'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/habits/4/reactivate',
          expect.objectContaining({ method: 'POST' })
        );
      });
      expect(toastSuccess).toHaveBeenCalled();
      expect(onMutate).toHaveBeenCalled();
    });

    it('toasts error when reactivate API fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          })
        )
      );
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} onMutate={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));
      await user.click(await screen.findByTestId('reactivate-btn-4'));
      await user.click(screen.getByTestId('reactivate-confirm'));

      await waitFor(() => {
        expect(toastError).toHaveBeenCalled();
      });
    });

    it('closes reactivate dialog on cancel', async () => {
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));
      await user.click(await screen.findByTestId('reactivate-btn-4'));
      await user.click(screen.getByTestId('reactivate-cancel'));

      await waitFor(() => {
        expect(screen.queryByTestId('reactivate-dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('delete formed habit', () => {
    it('does nothing when user cancels the confirm prompt', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));
      await user.click(await screen.findByTestId('delete-btn-4'));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('deletes a formed habit when user confirms', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const onMutate = vi.fn();
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} onMutate={onMutate} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));
      await user.click(await screen.findByTestId('delete-btn-4'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/habits/4',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
      expect(toastSuccess).toHaveBeenCalled();
      expect(onMutate).toHaveBeenCalled();
      confirmSpy.mockRestore();
    });

    it('toasts error when delete API fails', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({}),
          })
        )
      );
      const user = userEvent.setup();
      render(<HabitList {...defaultProps} onMutate={vi.fn()} />);

      await user.click(screen.getByRole('tab', { name: /Formed/i }));
      await user.click(await screen.findByTestId('delete-btn-4'));

      await waitFor(() => {
        expect(toastError).toHaveBeenCalled();
      });
      confirmSpy.mockRestore();
    });
  });

  describe('accessibility', () => {
    it('has no axe violations', async () => {
      const { container } = render(<HabitList {...defaultProps} />);
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
