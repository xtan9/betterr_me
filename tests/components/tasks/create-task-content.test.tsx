import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTaskContent } from '@/components/tasks/create-task-content';

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

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

const allTranslations: Record<string, Record<string, string>> = {
  'tasks': {
    'toast.createSuccess': 'Task created successfully',
    'toast.createError': 'Failed to create task',
  },
  'tasks.form': {
    'createTitle': 'Create New Task',
    'editTitle': 'Edit Task',
    'titleLabel': 'Title',
    'titlePlaceholder': 'What do you need to do?',
    'descriptionLabel': 'Description',
    'descriptionPlaceholder': 'Add some details...',
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
  'tasks.breadcrumb': {
    'newTask': 'New Task',
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
    return (key: string) => ns[key] ?? key;
  },
}));

describe('CreateTaskContent', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the task form', () => {
    render(<CreateTaskContent />);
    expect(screen.getByText('Create New Task')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Task' })).toBeInTheDocument();
  });

  it('navigates to /tasks on successful creation', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ task: { id: 't1', title: 'Test' } }),
    } as Response);

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'New Task');
    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith('Task created successfully');
    });
    expect(mockPush).toHaveBeenCalledWith('/tasks');
  });

  it('revalidates dashboard and tasks cache after successful creation', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ task: { id: 't1', title: 'Test' } }),
    } as Response);

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'New Task');
    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(mockGlobalMutate).toHaveBeenCalledWith('/api/dashboard');
      // Second call uses a function matcher for /api/tasks*
      expect(mockGlobalMutate).toHaveBeenCalledWith(
        expect.any(Function),
        undefined,
      );
    });
  });

  it('shows error toast on API failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Title is required' }),
    } as Response);

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create task');
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGlobalMutate).not.toHaveBeenCalled();
  });

  it('shows error toast on network failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create task');
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

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled();
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(unhandledRejection).not.toHaveBeenCalled();

    window.removeEventListener('unhandledrejection', unhandledRejection);
  });

  it('sends correct data to the API', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ task: { id: 't1' } }),
    } as Response);

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'Buy milk');
    await user.click(screen.getByRole('button', { name: /Shopping/ }));
    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      });
    });

    const callBody = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]!.body as string);
    expect(callBody.title).toBe('Buy milk');
    expect(callBody.category).toBe('shopping');
    expect(callBody.description).toBeNull();
    expect(callBody.due_time).toBeNull();
  });

  it('formats due_time with seconds when present', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ task: { id: 't1' } }),
    } as Response);

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'Meeting');

    // Simulate typing a time value via the input
    const timeInput = screen.getByLabelText('Due Time');
    // fireEvent is needed for input type="time" since userEvent.type doesn't work well
    await userEvent.clear(timeInput);
    // For type="time" inputs, we need to use fireEvent
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(timeInput, { target: { value: '09:30' } });

    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const callBody = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]!.body as string);
    expect(callBody.due_time).toBe('09:30:00');
  });

  it('navigates back on cancel', async () => {
    render(<CreateTaskContent />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('handles json parse failure on error response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('Invalid JSON')),
    } as Response);

    render(<CreateTaskContent />);

    await user.type(screen.getByLabelText('Title'), 'Test');
    await user.click(screen.getByRole('button', { name: 'Create Task' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create task');
    });
  });
});
