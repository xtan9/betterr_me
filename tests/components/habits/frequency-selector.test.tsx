import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FrequencySelector } from '@/components/habits/frequency-selector';
import type { HabitFrequency } from '@/lib/db/types';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, params?: Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'daily': 'Every day',
        'weekdays': 'Mon – Fri',
        'weekly': 'Once a week',
        'timesPerWeek': `${params?.count ?? ''} times/week`,
        'custom': 'Custom days',
        'selectedDays': `Selected: ${params?.days ?? ''}`,
        'days.sun': 'Sun',
        'days.mon': 'Mon',
        'days.tue': 'Tue',
        'days.wed': 'Wed',
        'days.thu': 'Thu',
        'days.fri': 'Fri',
        'days.sat': 'Sat',
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

describe('FrequencySelector', () => {
  const mockOnChange = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders all 6 frequency options', () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Every day')).toBeInTheDocument();
      expect(screen.getByText('Mon – Fri')).toBeInTheDocument();
      expect(screen.getByText('Once a week')).toBeInTheDocument();
      expect(screen.getByText('2 times/week')).toBeInTheDocument();
      expect(screen.getByText('3 times/week')).toBeInTheDocument();
      expect(screen.getByText('Custom days')).toBeInTheDocument();
    });

    it('highlights the currently selected frequency', () => {
      render(
        <FrequencySelector
          value={{ type: 'weekdays' }}
          onChange={mockOnChange}
        />
      );

      const weekdaysButton = screen.getByText('Mon – Fri').closest('button');
      expect(weekdaysButton).toHaveAttribute('data-state', 'on');

      const dailyButton = screen.getByText('Every day').closest('button');
      expect(dailyButton).toHaveAttribute('data-state', 'off');
    });

    it('highlights times_per_week with correct count', () => {
      render(
        <FrequencySelector
          value={{ type: 'times_per_week', count: 3 }}
          onChange={mockOnChange}
        />
      );

      const threeTimesButton = screen.getByText('3 times/week').closest('button');
      expect(threeTimesButton).toHaveAttribute('data-state', 'on');

      const twoTimesButton = screen.getByText('2 times/week').closest('button');
      expect(twoTimesButton).toHaveAttribute('data-state', 'off');
    });

    it('does not show custom day picker when non-custom frequency is selected', () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.queryByText('Sun')).not.toBeInTheDocument();
      expect(screen.queryByText('Mon')).not.toBeInTheDocument();
    });

    it('shows custom day picker when custom frequency is selected', () => {
      render(
        <FrequencySelector
          value={{ type: 'custom', days: [1, 3, 5] }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByRole('button', { name: 'Sun' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Mon' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tue' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Wed' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Thu' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fri' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sat' })).toBeInTheDocument();
    });

    it('shows selected days summary for custom frequency', () => {
      render(
        <FrequencySelector
          value={{ type: 'custom', days: [1, 3, 5] }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/Selected: Mon, Wed, Fri/)).toBeInTheDocument();
    });

    it('highlights selected days in custom mode', () => {
      render(
        <FrequencySelector
          value={{ type: 'custom', days: [1, 3] }}
          onChange={mockOnChange}
        />
      );

      const monButton = screen.getByRole('button', { name: 'Mon' });
      const tueButton = screen.getByRole('button', { name: 'Tue' });
      const wedButton = screen.getByRole('button', { name: 'Wed' });

      expect(monButton).toHaveAttribute('data-state', 'on');
      expect(tueButton).toHaveAttribute('data-state', 'off');
      expect(wedButton).toHaveAttribute('data-state', 'on');
    });
  });

  describe('frequency selection', () => {
    it('calls onChange with daily frequency when "Every day" is clicked', async () => {
      render(
        <FrequencySelector
          value={{ type: 'weekly' }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('Every day'));
      expect(mockOnChange).toHaveBeenCalledWith({ type: 'daily' });
    });

    it('calls onChange with weekdays frequency', async () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('Mon – Fri'));
      expect(mockOnChange).toHaveBeenCalledWith({ type: 'weekdays' });
    });

    it('calls onChange with weekly frequency', async () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('Once a week'));
      expect(mockOnChange).toHaveBeenCalledWith({ type: 'weekly' });
    });

    it('calls onChange with times_per_week count 2', async () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('2 times/week'));
      expect(mockOnChange).toHaveBeenCalledWith({ type: 'times_per_week', count: 2 });
    });

    it('calls onChange with times_per_week count 3', async () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('3 times/week'));
      expect(mockOnChange).toHaveBeenCalledWith({ type: 'times_per_week', count: 3 });
    });

    it('calls onChange with custom frequency and default day when switching to custom', async () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('Custom days'));
      // Should default to at least one day (Monday = 1)
      expect(mockOnChange).toHaveBeenCalledWith({ type: 'custom', days: [1] });
    });
  });

  describe('custom day selection', () => {
    it('adds a day when clicking an unselected day', async () => {
      render(
        <FrequencySelector
          value={{ type: 'custom', days: [1, 3] }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Fri' }));
      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'custom',
        days: [1, 3, 5],
      });
    });

    it('removes a day when clicking a selected day (if more than 1 selected)', async () => {
      render(
        <FrequencySelector
          value={{ type: 'custom', days: [1, 3, 5] }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Wed' }));
      expect(mockOnChange).toHaveBeenCalledWith({
        type: 'custom',
        days: [1, 5],
      });
    });

    it('does not remove the last selected day (at least 1 required)', async () => {
      render(
        <FrequencySelector
          value={{ type: 'custom', days: [3] }}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Wed' }));
      // Should not call onChange since it would result in empty days
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('disables all frequency buttons when disabled prop is true', () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
          disabled
        />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toBeDisabled();
      });
    });

    it('does not call onChange when disabled', async () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
          disabled
        />
      );

      await user.click(screen.getByText('Mon – Fri'));
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('edit mode (pre-selected values)', () => {
    it('correctly pre-selects daily frequency in edit mode', () => {
      render(
        <FrequencySelector
          value={{ type: 'daily' }}
          onChange={mockOnChange}
        />
      );

      const dailyButton = screen.getByText('Every day').closest('button');
      expect(dailyButton).toHaveAttribute('data-state', 'on');
    });

    it('correctly pre-selects custom days in edit mode', () => {
      render(
        <FrequencySelector
          value={{ type: 'custom', days: [0, 2, 4, 6] }}
          onChange={mockOnChange}
        />
      );

      const customButton = screen.getByText('Custom days').closest('button');
      expect(customButton).toHaveAttribute('data-state', 'on');

      // Day buttons should reflect saved state
      expect(screen.getByRole('button', { name: 'Sun' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('button', { name: 'Mon' })).toHaveAttribute('data-state', 'off');
      expect(screen.getByRole('button', { name: 'Tue' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('button', { name: 'Wed' })).toHaveAttribute('data-state', 'off');
      expect(screen.getByRole('button', { name: 'Thu' })).toHaveAttribute('data-state', 'on');
      expect(screen.getByRole('button', { name: 'Fri' })).toHaveAttribute('data-state', 'off');
      expect(screen.getByRole('button', { name: 'Sat' })).toHaveAttribute('data-state', 'on');
    });

    it('correctly pre-selects times_per_week with count 2', () => {
      render(
        <FrequencySelector
          value={{ type: 'times_per_week', count: 2 }}
          onChange={mockOnChange}
        />
      );

      const twoTimesButton = screen.getByText('2 times/week').closest('button');
      expect(twoTimesButton).toHaveAttribute('data-state', 'on');
    });
  });
});
