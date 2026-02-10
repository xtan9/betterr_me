import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from '@/components/tasks/task-form';
import type { Task } from '@/lib/db/types';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        // form keys
        'createTitle': 'Create New Task',
        'editTitle': 'Edit Task',
        'titleLabel': 'Title',
        'titlePlaceholder': 'What do you need to do?',
        'descriptionLabel': 'Description',
        'descriptionPlaceholder': 'Add some details...',
        'categoryLabel': 'Category',
        'priorityLabel': 'Priority',
        'dueDateLabel': 'Due Date',
        'dueTimeLabel': 'Due Time',
        'cancel': 'Cancel',
        'create': 'Create Task',
        'save': 'Save Changes',
        'creating': 'Creating...',
        'saving': 'Saving...',
        // category keys
        'work': 'Work',
        'personal': 'Personal',
        'shopping': 'Shopping',
        'other': 'Other',
        'intentionLabel': 'Why This Matters',
        'intentionPlaceholder': 'Why does this matter to you?',
        // priority keys
        '0': 'None',
        '1': 'Low',
        '2': 'Medium',
        '3': 'High',
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

const mockTask: Task = {
  id: 'task-1',
  user_id: 'user-1',
  title: 'Buy groceries',
  description: 'Milk, eggs, bread',
  intention: null,
  is_completed: false,
  priority: 2,
  category: 'shopping',
  due_date: '2026-02-10',
  due_time: '14:30:00',
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('TaskForm', () => {
  const mockOnSubmit = vi.fn();
  const mockOnCancel = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockOnSubmit.mockResolvedValue(undefined);
  });

  describe('create mode rendering', () => {
    it('renders the create form with all fields', () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Create New Task')).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Priority')).toBeInTheDocument();
      expect(screen.getByLabelText('Due Date')).toBeInTheDocument();
      expect(screen.getByLabelText('Due Time')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Task' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('renders all 4 category options', () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByRole('button', { name: /Work/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Personal/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Shopping/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Other/ })).toBeInTheDocument();
    });
  });

  describe('edit mode rendering', () => {
    it('renders the edit form with pre-populated fields', () => {
      render(
        <TaskForm
          mode="edit"
          initialData={mockTask}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Edit Task')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Buy groceries')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Milk, eggs, bread')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });

    it('pre-selects the existing category in edit mode', () => {
      render(
        <TaskForm
          mode="edit"
          initialData={mockTask}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const shoppingButton = screen.getByRole('button', { name: /Shopping/ });
      expect(shoppingButton).toHaveAttribute('data-state', 'on');
    });

    it('populates due date and time from initialData', () => {
      render(
        <TaskForm
          mode="edit"
          initialData={mockTask}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByDisplayValue('2026-02-10')).toBeInTheDocument();
      // due_time "14:30:00" should be sliced to "14:30"
      expect(screen.getByDisplayValue('14:30')).toBeInTheDocument();
    });
  });

  describe('form submission', () => {
    it('submits create form with valid data', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Title'), 'Write report');
      await user.type(screen.getByLabelText('Description'), 'Q1 metrics');
      await user.click(screen.getByRole('button', { name: /Work/ }));
      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          title: 'Write report',
          description: 'Q1 metrics',
          intention: null,
          category: 'work',
          priority: 0,
          due_date: null,
          due_time: null,
        });
      });
    });

    it('submits create form without optional fields', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Title'), 'Quick task');
      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          title: 'Quick task',
          description: null,
          intention: null,
          category: null,
          priority: 0,
          due_date: null,
          due_time: null,
        });
      });
    });

    it('submits edit form with changed data', async () => {
      render(
        <TaskForm
          mode="edit"
          initialData={mockTask}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const titleInput = screen.getByDisplayValue('Buy groceries');
      await user.clear(titleInput);
      await user.type(titleInput, 'Buy supplies');
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Buy supplies',
          })
        );
      });
    });

    it('converts empty description to null on submit', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Title'), 'Test');
      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ description: null })
        );
      });
    });
  });

  describe('validation', () => {
    it('shows error when title is empty on submit', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(screen.getByText('Title is required')).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('shows error when title exceeds 100 characters', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const longTitle = 'a'.repeat(101);
      await user.type(screen.getByLabelText('Title'), longTitle);
      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(screen.getByText('Title must be 100 characters or less')).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('category selection', () => {
    it('selects a category when clicked', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const workButton = screen.getByRole('button', { name: /Work/ });
      await user.click(workButton);
      expect(workButton).toHaveAttribute('data-state', 'on');
    });

    it('deselects category when clicking the same one again', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const workButton = screen.getByRole('button', { name: /Work/ });
      await user.click(workButton);
      expect(workButton).toHaveAttribute('data-state', 'on');

      await user.click(workButton);
      expect(workButton).toHaveAttribute('data-state', 'off');
    });

    it('switches category when clicking a different one', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.click(screen.getByRole('button', { name: /Work/ }));
      await user.click(screen.getByRole('button', { name: /Personal/ }));

      const workButton = screen.getByRole('button', { name: /Work/ });
      const personalButton = screen.getByRole('button', { name: /Personal/ });
      expect(workButton).toHaveAttribute('data-state', 'off');
      expect(personalButton).toHaveAttribute('data-state', 'on');
    });
  });

  describe('intention field', () => {
    it('renders intention field in create mode', () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Why This Matters')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Why does this matter to you?')).toBeInTheDocument();
    });

    it('submits intention value when provided', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Title'), 'Go to gym');
      await user.type(screen.getByPlaceholderText('Why does this matter to you?'), 'To stay healthy');
      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ intention: 'To stay healthy' })
        );
      });
    });

    it('submits null intention when left empty', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Title'), 'Quick task');
      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({ intention: null })
        );
      });
    });

    it('pre-populates intention in edit mode', () => {
      const taskWithIntention = {
        ...mockTask,
        intention: 'To feel better about myself',
      };

      render(
        <TaskForm
          mode="edit"
          initialData={taskWithIntention}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByDisplayValue('To feel better about myself')).toBeInTheDocument();
    });
  });

  describe('cancel and loading', () => {
    it('calls onCancel when cancel button is clicked', async () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockOnCancel).toHaveBeenCalled();
    });

    it('disables form fields and buttons when isLoading is true', () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading
        />
      );

      expect(screen.getByLabelText('Title')).toBeDisabled();
      expect(screen.getByLabelText('Description')).toBeDisabled();
      expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    });

    it('shows loading text on submit button when isLoading', () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading
        />
      );

      expect(screen.getByRole('button', { name: /Creating/ })).toBeInTheDocument();
    });

    it('shows saving text in edit mode when isLoading', () => {
      render(
        <TaskForm
          mode="edit"
          initialData={mockTask}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading
        />
      );

      expect(screen.getByRole('button', { name: /Saving/ })).toBeInTheDocument();
    });
  });
});
