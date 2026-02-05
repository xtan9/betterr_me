import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreakCounter } from '@/components/habits/streak-counter';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'current': 'Current Streak',
        'best': 'Best Streak',
        'days': `${params?.count ?? 0} days`,
        'personalBest': 'Personal best!',
        'messages.zero': 'Start today!',
        'messages.building': 'Building momentum!',
        'messages.almostWeek': 'Almost a week!',
        'messages.keepGoing': 'Keep it going!',
        'messages.incredible': 'Incredible consistency!',
        'messages.unstoppable': "You're unstoppable!",
        'messages.legendary': 'Legendary streak!',
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
    Flame: (props: Record<string, unknown>) => <span data-testid="icon-flame" {...props} />,
    Star: (props: Record<string, unknown>) => <span data-testid="icon-star" {...props} />,
  };
});

describe('StreakCounter', () => {
  describe('default variant', () => {
    it('renders current and best streak labels', () => {
      render(<StreakCounter currentStreak={10} bestStreak={20} />);
      expect(screen.getByText('Current Streak')).toBeInTheDocument();
      expect(screen.getByText('Best Streak')).toBeInTheDocument();
    });

    it('renders streak day counts', () => {
      render(<StreakCounter currentStreak={10} bestStreak={20} />);
      expect(screen.getByText('10 days')).toBeInTheDocument();
      expect(screen.getByText('20 days')).toBeInTheDocument();
    });

    it('shows fire icon when current streak >= 7', () => {
      render(<StreakCounter currentStreak={7} bestStreak={10} />);
      expect(screen.getByTestId('icon-flame')).toBeInTheDocument();
    });

    it('does not show fire icon when current streak < 7', () => {
      render(<StreakCounter currentStreak={3} bestStreak={10} />);
      expect(screen.queryByTestId('icon-flame')).not.toBeInTheDocument();
    });

    it('shows star icon for best streak', () => {
      render(<StreakCounter currentStreak={5} bestStreak={10} />);
      expect(screen.getByTestId('icon-star')).toBeInTheDocument();
    });

    it('shows "Personal best!" when current equals best and both > 0', () => {
      render(<StreakCounter currentStreak={15} bestStreak={15} />);
      expect(screen.getByText('Personal best!')).toBeInTheDocument();
    });

    it('does not show "Personal best!" when streaks differ', () => {
      render(<StreakCounter currentStreak={10} bestStreak={20} />);
      expect(screen.queryByText('Personal best!')).not.toBeInTheDocument();
    });

    it('does not show "Personal best!" when both are 0', () => {
      render(<StreakCounter currentStreak={0} bestStreak={0} />);
      expect(screen.queryByText('Personal best!')).not.toBeInTheDocument();
    });
  });

  describe('encouraging messages', () => {
    it('shows "Start today!" for streak 0', () => {
      render(<StreakCounter currentStreak={0} bestStreak={5} />);
      expect(screen.getByText('Start today!')).toBeInTheDocument();
    });

    it('shows "Building momentum!" for streak 1-2', () => {
      render(<StreakCounter currentStreak={2} bestStreak={5} />);
      expect(screen.getByText('Building momentum!')).toBeInTheDocument();
    });

    it('shows "Almost a week!" for streak 3-6', () => {
      render(<StreakCounter currentStreak={5} bestStreak={10} />);
      expect(screen.getByText('Almost a week!')).toBeInTheDocument();
    });

    it('shows "Keep it going!" for streak 7-13', () => {
      render(<StreakCounter currentStreak={10} bestStreak={20} />);
      expect(screen.getByText('Keep it going!')).toBeInTheDocument();
    });

    it('shows "Incredible consistency!" for streak 14-29', () => {
      render(<StreakCounter currentStreak={20} bestStreak={30} />);
      expect(screen.getByText('Incredible consistency!')).toBeInTheDocument();
    });

    it('shows "You\'re unstoppable!" for streak 30-99', () => {
      render(<StreakCounter currentStreak={50} bestStreak={60} />);
      expect(screen.getByText("You're unstoppable!")).toBeInTheDocument();
    });

    it('shows "Legendary streak!" for streak >= 100', () => {
      render(<StreakCounter currentStreak={100} bestStreak={100} />);
      expect(screen.getByText('Legendary streak!')).toBeInTheDocument();
    });
  });

  describe('compact variant', () => {
    it('renders streak counts inline', () => {
      render(<StreakCounter currentStreak={23} bestStreak={30} variant="compact" />);
      expect(screen.getByText('23 days')).toBeInTheDocument();
      expect(screen.getByText('30 days')).toBeInTheDocument();
    });

    it('does not show encouraging message in compact mode', () => {
      render(<StreakCounter currentStreak={10} bestStreak={20} variant="compact" />);
      expect(screen.queryByText('Keep it going!')).not.toBeInTheDocument();
    });

    it('shows fire icon when streak >= 7 in compact mode', () => {
      render(<StreakCounter currentStreak={10} bestStreak={20} variant="compact" />);
      expect(screen.getByTestId('icon-flame')).toBeInTheDocument();
    });
  });
});
