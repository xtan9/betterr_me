import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HabitForm } from '@/components/habits/habit-form';
import type { Habit } from '@/lib/db/types';

// Namespace-aware mock matching next-intl's useTranslations behavior
const allTranslations: Record<string, Record<string, string>> = {
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
  'habits.frequency': {
    'daily': 'Every day',
    'weekdays': 'Mon \u2013 Fri',
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
    return (key: string, params?: Record<string, unknown>) => {
      if (ns[key]) return ns[key];
      if (key === 'timesPerWeek') return `${params?.count ?? ''} times/week`;
      if (key === 'selectedDays') return `Selected: ${params?.days ?? ''}`;
      return key;
    };
  },
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('@/lib/hooks/use-categories', () => ({
  useCategories: () => ({
    categories: [],
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

const mockHabit: Habit = {
  id: 'habit-1',
  user_id: 'user-1',
  name: 'Morning Run',
  description: 'Run for 30 minutes every morning',
  category: null,
  category_id: null,
  frequency: { type: 'daily' },
  status: 'active',
  current_streak: 5,
  best_streak: 10,
  paused_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('HabitForm', () => {
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
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Create New Habit')).toBeInTheDocument();
      expect(screen.getByLabelText('Habit Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('How often?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Habit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('renders CategoryPicker with Add button', () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      // CategoryPicker renders an "Add" button for creating new categories
      expect(screen.getByRole('button', { name: /Add/ })).toBeInTheDocument();
    });

    it('renders all 6 frequency options', () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Every day')).toBeInTheDocument();
      expect(screen.getByText('Mon – Fri')).toBeInTheDocument();
      expect(screen.getByText('Once a week')).toBeInTheDocument();
      expect(screen.getByText('2 times/week')).toBeInTheDocument();
      expect(screen.getByText('3 times/week')).toBeInTheDocument();
      expect(screen.getByText('Custom days')).toBeInTheDocument();
    });

    it('defaults to daily frequency in create mode', () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const dailyButton = screen.getByText('Every day').closest('button');
      expect(dailyButton).toHaveAttribute('data-state', 'on');
    });
  });

  describe('edit mode rendering', () => {
    it('renders the edit form with pre-populated fields', () => {
      render(
        <HabitForm
          mode="edit"
          initialData={mockHabit}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      expect(screen.getByText('Edit Habit')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Morning Run')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Run for 30 minutes every morning')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    });

    it('pre-selects the existing frequency in edit mode', () => {
      render(
        <HabitForm
          mode="edit"
          initialData={mockHabit}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const dailyButton = screen.getByText('Every day').closest('button');
      expect(dailyButton).toHaveAttribute('data-state', 'on');
    });

    it('pre-selects custom frequency with days in edit mode', () => {
      const customHabit = {
        ...mockHabit,
        frequency: { type: 'custom' as const, days: [1, 3, 5] },
      };
      render(
        <HabitForm
          mode="edit"
          initialData={customHabit}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const customButton = screen.getByText('Custom days').closest('button');
      expect(customButton).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('button', { name: 'Wed' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('button', { name: 'Fri' })).toHaveAttribute('data-state', 'on');
    });
  });

  describe('form submission', () => {
    it('submits create form with valid data', async () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Habit Name'), 'Read Books');
      await user.type(screen.getByLabelText('Description'), 'Read for 30 minutes');
      await user.click(screen.getByRole('button', { name: 'Create Habit' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: 'Read Books',
          description: 'Read for 30 minutes',
          category_id: null,
          frequency: { type: 'daily' },
        });
      });
    });

    it('submits create form without optional fields', async () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Habit Name'), 'Meditate');
      await user.click(screen.getByRole('button', { name: 'Create Habit' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: 'Meditate',
          description: null,
          category_id: null,
          frequency: { type: 'daily' },
        });
      });
    });

    it('submits edit form with changed data', async () => {
      render(
        <HabitForm
          mode="edit"
          initialData={mockHabit}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const nameInput = screen.getByDisplayValue('Morning Run');
      await user.clear(nameInput);
      await user.type(nameInput, 'Evening Walk');
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith({
          name: 'Evening Walk',
          description: 'Run for 30 minutes every morning',
          category_id: null,
          frequency: { type: 'daily' },
        });
      });
    });

    it('submits with selected frequency', async () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.type(screen.getByLabelText('Habit Name'), 'Exercise');
      await user.click(screen.getByText('Mon – Fri'));
      await user.click(screen.getByRole('button', { name: 'Create Habit' }));

      await waitFor(() => {
        expect(mockOnSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Exercise',
            frequency: { type: 'weekdays' },
          })
        );
      });
    });
  });

  describe('validation', () => {
    it('shows error when name is empty on submit', async () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Create Habit' }));

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    it('shows error when name exceeds 100 characters', async () => {
      render(
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
        />
      );

      const longName = 'a'.repeat(101);
      await user.type(screen.getByLabelText('Habit Name'), longName);
      await user.click(screen.getByRole('button', { name: 'Create Habit' }));

      await waitFor(() => {
        expect(screen.getByText('Name must be 100 characters or less')).toBeInTheDocument();
      });
      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('cancel and loading', () => {
    it('calls onCancel when cancel button is clicked', async () => {
      render(
        <HabitForm
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
        <HabitForm
          mode="create"
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading
        />
      );

      expect(screen.getByLabelText('Habit Name')).toBeDisabled();
      expect(screen.getByLabelText('Description')).toBeDisabled();
      expect(screen.getByRole('button', { name: /Creating/ })).toBeDisabled();
    });

    it('shows loading text on submit button when isLoading', () => {
      render(
        <HabitForm
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
        <HabitForm
          mode="edit"
          initialData={mockHabit}
          onSubmit={mockOnSubmit}
          onCancel={mockOnCancel}
          isLoading
        />
      );

      expect(screen.getByRole('button', { name: /Saving/ })).toBeInTheDocument();
    });
  });
});
