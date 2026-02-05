import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekStartSelector } from '@/components/settings/week-start-selector';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        sunday: 'Sunday',
        monday: 'Monday',
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

describe('WeekStartSelector', () => {
  const mockOnChange = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders Sunday and Monday options', () => {
      render(
        <WeekStartSelector
          value={0}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Sunday')).toBeInTheDocument();
      expect(screen.getByText('Monday')).toBeInTheDocument();
    });

    it('highlights Sunday when value is 0', () => {
      render(
        <WeekStartSelector
          value={0}
          onChange={mockOnChange}
        />
      );

      const sundayButton = screen.getByText('Sunday').closest('button');
      const mondayButton = screen.getByText('Monday').closest('button');

      expect(sundayButton).toHaveAttribute('data-state', 'on');
      expect(mondayButton).toHaveAttribute('data-state', 'off');
    });

    it('highlights Monday when value is 1', () => {
      render(
        <WeekStartSelector
          value={1}
          onChange={mockOnChange}
        />
      );

      const sundayButton = screen.getByText('Sunday').closest('button');
      const mondayButton = screen.getByText('Monday').closest('button');

      expect(sundayButton).toHaveAttribute('data-state', 'off');
      expect(mondayButton).toHaveAttribute('data-state', 'on');
    });
  });

  describe('selection', () => {
    it('calls onChange with 0 when Sunday is clicked', async () => {
      render(
        <WeekStartSelector
          value={1}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('Sunday'));
      expect(mockOnChange).toHaveBeenCalledWith(0);
    });

    it('calls onChange with 1 when Monday is clicked', async () => {
      render(
        <WeekStartSelector
          value={0}
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByText('Monday'));
      expect(mockOnChange).toHaveBeenCalledWith(1);
    });

    it('does not call onChange when clicking already selected option', async () => {
      render(
        <WeekStartSelector
          value={0}
          onChange={mockOnChange}
        />
      );

      // Click the already selected Sunday option
      await user.click(screen.getByText('Sunday'));
      // ToggleGroup doesn't call onChange when selecting already selected item
      // The implementation only calls onChange when val is truthy (not empty string)
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('disables both buttons when disabled prop is true', () => {
      render(
        <WeekStartSelector
          value={0}
          onChange={mockOnChange}
          disabled
        />
      );

      const sundayButton = screen.getByText('Sunday').closest('button');
      const mondayButton = screen.getByText('Monday').closest('button');

      expect(sundayButton).toBeDisabled();
      expect(mondayButton).toBeDisabled();
    });

    it('does not call onChange when disabled', async () => {
      render(
        <WeekStartSelector
          value={0}
          onChange={mockOnChange}
          disabled
        />
      );

      await user.click(screen.getByText('Monday'));
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct aria-labels', () => {
      render(
        <WeekStartSelector
          value={0}
          onChange={mockOnChange}
        />
      );

      // ToggleGroup items have role="radio" with aria-label
      expect(screen.getByRole('radio', { name: 'Sunday' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Monday' })).toBeInTheDocument();
    });
  });
});
