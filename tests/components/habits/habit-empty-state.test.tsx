import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HabitEmptyState } from '@/components/habits/habit-empty-state';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'noHabits.title': 'Start Your Journey',
        'noHabits.description': 'Track your first habit and build lasting change.',
        'noHabits.cta': 'Create First Habit',
        'allComplete.title': 'Perfect Day!',
        'allComplete.description': "You've completed all your habits today. Amazing work!",
        'noResults.title': `No habits matching "${params?.query ?? ''}"`,
        'noResults.description': 'Try a different search term.',
        'noPaused.title': 'No paused habits',
        'noPaused.description': 'Paused habits will appear here.',
        'noArchived.title': 'No archived habits',
        'noArchived.description': 'Archived habits will appear here.',
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

vi.mock('lucide-react', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    ClipboardList: (props: Record<string, unknown>) => <span data-testid="icon-clipboard" {...props} />,
    PartyPopper: (props: Record<string, unknown>) => <span data-testid="icon-party" {...props} />,
    Search: (props: Record<string, unknown>) => <span data-testid="icon-search" {...props} />,
    Pause: (props: Record<string, unknown>) => <span data-testid="icon-pause" {...props} />,
    Archive: (props: Record<string, unknown>) => <span data-testid="icon-archive" {...props} />,
  };
});

describe('HabitEmptyState', () => {
  describe('no_habits variant', () => {
    it('renders the title and description', () => {
      render(<HabitEmptyState variant="no_habits" />);
      expect(screen.getByText('Start Your Journey')).toBeInTheDocument();
      expect(screen.getByText('Track your first habit and build lasting change.')).toBeInTheDocument();
    });

    it('renders the clipboard icon', () => {
      render(<HabitEmptyState variant="no_habits" />);
      expect(screen.getByTestId('icon-clipboard')).toBeInTheDocument();
    });

    it('renders the CTA button when onCreateHabit is provided', () => {
      const onCreateHabit = vi.fn();
      render(<HabitEmptyState variant="no_habits" onCreateHabit={onCreateHabit} />);
      expect(screen.getByRole('button', { name: 'Create First Habit' })).toBeInTheDocument();
    });

    it('calls onCreateHabit when CTA is clicked', () => {
      const onCreateHabit = vi.fn();
      render(<HabitEmptyState variant="no_habits" onCreateHabit={onCreateHabit} />);

      fireEvent.click(screen.getByRole('button', { name: 'Create First Habit' }));
      expect(onCreateHabit).toHaveBeenCalled();
    });

    it('does not render CTA button when onCreateHabit is not provided', () => {
      render(<HabitEmptyState variant="no_habits" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('all_complete variant', () => {
    it('renders the celebration title and description', () => {
      render(<HabitEmptyState variant="all_complete" />);
      expect(screen.getByText('Perfect Day!')).toBeInTheDocument();
      expect(screen.getByText("You've completed all your habits today. Amazing work!")).toBeInTheDocument();
    });

    it('renders the party icon', () => {
      render(<HabitEmptyState variant="all_complete" />);
      expect(screen.getByTestId('icon-party')).toBeInTheDocument();
    });

    it('does not render a CTA button', () => {
      render(<HabitEmptyState variant="all_complete" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('no_results variant', () => {
    it('renders the search query in the title', () => {
      render(<HabitEmptyState variant="no_results" searchQuery="morning" />);
      expect(screen.getByText('No habits matching "morning"')).toBeInTheDocument();
    });

    it('renders the description', () => {
      render(<HabitEmptyState variant="no_results" searchQuery="test" />);
      expect(screen.getByText('Try a different search term.')).toBeInTheDocument();
    });

    it('renders the search icon', () => {
      render(<HabitEmptyState variant="no_results" searchQuery="test" />);
      expect(screen.getByTestId('icon-search')).toBeInTheDocument();
    });
  });

  describe('no_paused variant', () => {
    it('renders the paused title and description', () => {
      render(<HabitEmptyState variant="no_paused" />);
      expect(screen.getByText('No paused habits')).toBeInTheDocument();
      expect(screen.getByText('Paused habits will appear here.')).toBeInTheDocument();
    });

    it('renders the pause icon', () => {
      render(<HabitEmptyState variant="no_paused" />);
      expect(screen.getByTestId('icon-pause')).toBeInTheDocument();
    });
  });

  describe('no_archived variant', () => {
    it('renders the archived title and description', () => {
      render(<HabitEmptyState variant="no_archived" />);
      expect(screen.getByText('No archived habits')).toBeInTheDocument();
      expect(screen.getByText('Archived habits will appear here.')).toBeInTheDocument();
    });

    it('renders the archive icon', () => {
      render(<HabitEmptyState variant="no_archived" />);
      expect(screen.getByTestId('icon-archive')).toBeInTheDocument();
    });
  });

  describe('common styles', () => {
    it('has centered layout', () => {
      render(<HabitEmptyState variant="no_habits" />);
      const container = screen.getByTestId('empty-state');
      expect(container).toHaveClass('text-center');
    });
  });
});
