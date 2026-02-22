import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskForm } from '@/components/tasks/task-form';
import type { Task } from '@/lib/db/types';

const allTranslations: Record<string, Record<string, string>> = {
  'tasks.form': {
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
    'repeatLabel': 'Repeat',
  },
  'tasks': {
    'sectionLabel': 'Section',
    'sections.personal': 'Personal',
    'sections.work': 'Work',
    'projectLabel': 'Project',
    'projectPlaceholder': 'Select a project',
    'noProject': 'No Project',
  },
  'tasks.priorities': {
    '0': 'None',
    '1': 'Low',
    '2': 'Medium',
    '3': 'High',
  },
  'categories': {
    'add': 'Add',
    'namePlaceholder': 'Category name',
    'creating': 'Creating...',
    'create': 'Create',
  },
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const ns = allTranslations[namespace] ?? {};
    return (key: string) => ns[key] ?? key;
  },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/lib/hooks/use-projects', () => ({
  useProjects: () => ({
    projects: [],
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/use-categories', () => ({
  useCategories: () => ({
    categories: [],
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

const mockTask: Task = {
  id: 'task-1',
  user_id: 'user-1',
  title: 'Buy groceries',
  description: 'Milk, eggs, bread',
  is_completed: false,
  priority: 2,
  category: null,
  category_id: null,
  due_date: '2026-02-10',
  due_time: '14:30:00',
  completed_at: null,
  completion_difficulty: null,
  status: 'todo',
  section: 'personal',
  sort_order: 1,
  project_id: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  recurring_task_id: null,
  is_exception: false,
  original_date: null,
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

    it('renders CategoryPicker with Add button', () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // CategoryPicker renders an "Add" button for creating new categories
      expect(screen.getByRole('button', { name: /Add/ })).toBeInTheDocument();
    });

    it('renders section toggle and project dropdown', () => {
      render(
        <TaskForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Section')).toBeInTheDocument();
      expect(screen.getByText('Project')).toBeInTheDocument();
      // "No Project" may appear in both the trigger and dropdown item
      expect(screen.getAllByText('No Project').length).toBeGreaterThanOrEqual(1);
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
      await user.click(screen.getByRole('button', { name: 'Create Task' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Write report',
            description: 'Q1 metrics',
            category_id: null,
            section: 'personal',
            project_id: null,
          }),
          undefined
        );
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
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Quick task',
            description: null,
            category_id: null,
            priority: 0,
            due_date: null,
            due_time: null,
            section: 'personal',
            project_id: null,
          }),
          undefined
        );
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
          }),
          undefined
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
          expect.objectContaining({ description: null }),
          undefined
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
