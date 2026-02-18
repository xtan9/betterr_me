import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
  useSearchParams: () => new URLSearchParams(),
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
  'tasks': {
    'edit.success': 'Task updated successfully',
    'edit.error': 'Failed to update task',
    'error.title': 'Failed to load task',
    'error.retry': 'Try again',
  },
  'tasks.form': {
    'createTitle': 'Create New Task',
    'editTitle': 'Edit Task',
    'titleLabel': 'Task Title',
    'titlePlaceholder': 'e.g., Buy groceries, Finish report...',
    'descriptionLabel': 'Description',
    'descriptionPlaceholder': 'Optional notes about this task',
    'intentionLabel': 'Your Why',
    'intentionPlaceholder': 'Why is this task important to you?',
    'categoryLabel': 'Category',
    'priorityLabel': 'Priority',
    'dueDateLabel': 'Due Date',
    'dueTimeLabel': 'Due Time',
    'cancel': 'Cancel',
    'create': 'Create Task',
    'save': 'Save Changes',
    'creating': 'Creating...',
    'saving': 'Saving...',
  },
  'tasks.categories': {
    'work': 'Work',
    'personal': 'Personal',
    'shopping': 'Shopping',
    'other': 'Other',
  },
  'tasks.priorities': {
    '0': 'None',
    '1': 'Low',
    '2': 'Medium',
    '3': 'High',
  },
  'common.nav': {
    'tasks': 'Tasks',
    'habits': 'Habits',
    'settings': 'Settings',
  },
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const ns = allTranslations[namespace] ?? {};
    return (key: string) => {
      return ns[key] ?? key;
    };
  },
}));

const mockMutate = vi.fn();

vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';
import { EditTaskContent } from '@/components/tasks/edit-task-content';

const mockTask = {
  id: 'task-1',
  user_id: 'user-1',
  title: 'Buy groceries',
  description: 'Milk, eggs, bread',
  is_completed: false,
  priority: 2 as const,
  category: 'shopping' as const,
  due_date: '2026-02-10',
  due_time: '14:30:00',
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('EditTaskContent', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: mockTask,
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

    render(<EditTaskContent taskId="task-1" />);
    expect(screen.getByTestId('edit-task-skeleton')).toBeInTheDocument();
  });

  it('renders error state on fetch failure', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error('Failed to fetch'),
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<EditTaskContent taskId="task-1" />);
    expect(screen.getByText('Failed to load task')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('renders the edit form with pre-populated data', () => {
    render(<EditTaskContent taskId="task-1" />);

    expect(screen.getByText('Edit Task')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Buy groceries')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Milk, eggs, bread')).toBeInTheDocument();
  });

  it('navigates back on successful update', async () => {
    mockMutate.mockResolvedValue(undefined);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ task: mockTask }),
    } as Response);

    render(<EditTaskContent taskId="task-1" />);

    const titleInput = screen.getByDisplayValue('Buy groceries');
    await user.clear(titleInput);
    await user.type(titleInput, 'Buy organic groceries');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Task updated successfully');
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('shows error toast on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Validation failed' }),
    } as Response);

    render(<EditTaskContent taskId="task-1" />);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update task');
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows error toast on network failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    render(<EditTaskContent taskId="task-1" />);

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update task');
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

    render(<EditTaskContent taskId="task-1" />);
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
      json: () => Promise.resolve({ task: mockTask }),
    } as Response);

    render(<EditTaskContent taskId="task-1" />);
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/tasks/task-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      });
    });
  });

  it('navigates back on cancel', async () => {
    render(<EditTaskContent taskId="task-1" />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockBack).toHaveBeenCalled();
  });
});
