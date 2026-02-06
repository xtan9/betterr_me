import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditHabitContent } from '@/components/habits/edit-habit-content';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Namespace-aware mock matching next-intl's useTranslations behavior
const allTranslations: Record<string, Record<string, string>> = {
  'habits': {
    'toast.updateSuccess': 'Habit updated successfully',
    'toast.updateError': 'Failed to update habit',
    'error.title': 'Failed to load habits',
    'error.retry': 'Try again',
  },
  'habits.form': {
    'createTitle': 'Create New Habit',
    'editTitle': 'Edit Habit',
    'nameLabel': 'Habit Name',
    'namePlaceholder': 'e.g., Morning Run, Read 30 mins...',
    'descriptionLabel': 'Description',
    'descriptionPlaceholder': 'Optional notes about this habit',
    'categoryLabel': 'Category',
    'frequencyLabel': 'How often?',
    'cancel': 'Cancel',
    'create': 'Create Habit',
    'save': 'Save Changes',
    'creating': 'Creating...',
    'saving': 'Saving...',
    'validation.nameRequired': 'Name is required',
    'validation.nameMax': 'Name must be 100 characters or less',
  },
  'habits.categories': {
    'health': 'Health',
    'wellness': 'Wellness',
    'learning': 'Learning',
    'productivity': 'Productivity',
    'other': 'Other',
  },
  'habits.frequency': {
    'daily': 'Every day',
    'weekdays': 'Mon – Fri',
    'weekly': 'Once a week',
    'custom': 'Custom days',
    'days.sun': 'Sun',
    'days.mon': 'Mon',
    'days.tue': 'Tue',
    'days.wed': 'Wed',
    'days.thu': 'Thu',
    'days.fri': 'Fri',
    'days.sat': 'Sat',
  },
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const ns = allTranslations[namespace] ?? {};
    return (key: string, params?: Record<string, unknown>) => {
      if (ns[key]) return ns[key];
      if (key === 'timesPerWeek') return `${params?.count ?? ''} times/week`;
      if (key === 'selectedDays') return `Selected: ${params?.days ?? ''}`;
      return key;
    };
  },
}));

const mockHabit = {
  id: 'habit-1',
  user_id: 'user-123',
  name: 'Morning Run',
  description: 'Run 5km',
  category: 'health',
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 5,
  best_streak: 12,
  paused_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

// Mock SWR
const mockMutate = vi.fn();

vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';

describe('EditHabitContent', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: mockHabit,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);
  });

  it('renders loading skeleton while fetching', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<EditHabitContent habitId="habit-1" />);
    expect(screen.getByTestId('edit-habit-skeleton')).toBeInTheDocument();
  });

  it('renders error state on fetch failure', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error('Failed to fetch'),
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<EditHabitContent habitId="habit-1" />);
    expect(screen.getByText('Failed to load habits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders the edit form with pre-populated data', () => {
    render(<EditHabitContent habitId="habit-1" />);

    expect(screen.getByText('Edit Habit')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Morning Run')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Run 5km')).toBeInTheDocument();
  });

  it('navigates back on successful update', async () => {
    mockMutate.mockResolvedValue(undefined);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ habit: mockHabit }),
    } as Response);

    render(<EditHabitContent habitId="habit-1" />);

    const nameInput = screen.getByDisplayValue('Morning Run');
    await user.clear(nameInput);
    await user.type(nameInput, 'Evening Walk');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Habit updated successfully');
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows error toast on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Validation failed' }),
    } as Response);

    render(<EditHabitContent habitId="habit-1" />);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update habit');
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows error toast on network failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    render(<EditHabitContent habitId="habit-1" />);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update habit');
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('does not re-throw errors (no unhandled rejection)', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    } as Response);

    const unhandledRejection = vi.fn();
    window.addEventListener('unhandledrejection', unhandledRejection);

    render(<EditHabitContent habitId="habit-1" />);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(unhandledRejection).not.toHaveBeenCalled();

    window.removeEventListener('unhandledrejection', unhandledRejection);
  });

  it('sends PATCH request to correct endpoint', async () => {
    mockMutate.mockResolvedValue(undefined);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ habit: mockHabit }),
    } as Response);

    render(<EditHabitContent habitId="habit-1" />);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/habits/habit-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      });
    });
  });

  it('navigates back on cancel', async () => {
    render(<EditHabitContent habitId="habit-1" />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('retries data fetch on error retry click', async () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error('Failed'),
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<EditHabitContent habitId="habit-1" />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mockMutate).toHaveBeenCalled();
  });
});
