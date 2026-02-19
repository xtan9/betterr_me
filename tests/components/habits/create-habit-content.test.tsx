import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateHabitContent } from '@/components/habits/create-habit-content';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

const mockGlobalMutate = vi.fn();

vi.mock('swr', () => ({
  useSWRConfig: () => ({
    mutate: mockGlobalMutate,
  }),
}));

vi.mock('@/lib/hooks/use-sidebar-counts', () => ({
  revalidateSidebarCounts: vi.fn(),
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
  'common.nav': {
    'habits': 'Habits',
    'tasks': 'Tasks',
    'settings': 'Settings',
  },
  'habits': {
    'toast.createSuccess': 'Habit created successfully',
    'toast.createError': 'Failed to create habit',
  },
  'habits.breadcrumb': {
    'newHabit': 'New Habit',
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

describe('CreateHabitContent', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the habit form', () => {
    render(<CreateHabitContent />);
    expect(screen.getByText('Create New Habit')).toBeInTheDocument();
    expect(screen.getByLabelText('Habit Name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Habit' })).toBeInTheDocument();
  });

  it('navigates to /habits on successful creation', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ habit: { id: 'h1', name: 'Test' } }),
    } as Response);

    render(<CreateHabitContent />);

    await user.type(screen.getByLabelText('Habit Name'), 'Morning Run');
    await user.click(screen.getByRole('button', { name: 'Create Habit' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Habit created successfully');
    });
    expect(mockPush).toHaveBeenCalledWith('/habits');
  });

  it('revalidates dashboard and habits cache after successful creation', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ habit: { id: 'h1', name: 'Test' } }),
    } as Response);

    render(<CreateHabitContent />);

    await user.type(screen.getByLabelText('Habit Name'), 'Morning Run');
    await user.click(screen.getByRole('button', { name: 'Create Habit' }));

    await waitFor(() => {
      expect(mockGlobalMutate).toHaveBeenCalledWith('/api/dashboard');
      expect(mockGlobalMutate).toHaveBeenCalledWith('/api/habits?with_today=true');
    });
  });

  it('shows error toast on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Name is required' }),
    } as Response);

    render(<CreateHabitContent />);

    await user.type(screen.getByLabelText('Habit Name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Habit' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create habit');
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGlobalMutate).not.toHaveBeenCalled();
  });

  it('shows error toast on network failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    render(<CreateHabitContent />);

    await user.type(screen.getByLabelText('Habit Name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Habit' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create habit');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not re-throw errors (no unhandled rejection)', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    } as Response);

    const unhandledRejection = vi.fn();
    window.addEventListener('unhandledrejection', unhandledRejection);

    render(<CreateHabitContent />);

    await user.type(screen.getByLabelText('Habit Name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Habit' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    // Give time for any unhandled rejections to surface
    await new Promise((r) => setTimeout(r, 50));
    expect(unhandledRejection).not.toHaveBeenCalled();

    window.removeEventListener('unhandledrejection', unhandledRejection);
  });

  it('sends correct data to the API', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ habit: { id: 'h1' } }),
    } as Response);

    render(<CreateHabitContent />);

    await user.type(screen.getByLabelText('Habit Name'), 'Read Books');
    await user.click(screen.getByRole('button', { name: /Learning/ }));
    await user.click(screen.getByRole('button', { name: 'Create Habit' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      });
    });

    const callBody = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]!.body as string);
    expect(callBody.name).toBe('Read Books');
    expect(callBody.category).toBe('learning');
    expect(callBody.frequency).toEqual({ type: 'daily' });
  });

  it('navigates back on cancel', async () => {
    render(<CreateHabitContent />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('handles json parse failure on error response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('Invalid JSON')),
    } as Response);

    render(<CreateHabitContent />);

    await user.type(screen.getByLabelText('Habit Name'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Habit' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create habit');
    });
  });
});
