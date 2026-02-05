import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimezoneSelector } from '@/components/settings/timezone-selector';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        placeholder: 'Select timezone',
        search: 'Search timezone...',
        noResults: 'No timezone found',
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

describe('TimezoneSelector', () => {
  const mockOnChange = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with placeholder when no value selected', () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByText('Select timezone')).toBeInTheDocument();
    });

    it('renders with selected timezone when value is provided', () => {
      render(
        <TimezoneSelector
          value="America/New_York"
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText(/America \/ New York/)).toBeInTheDocument();
    });

    it('displays timezone offset for selected value', () => {
      render(
        <TimezoneSelector
          value="Europe/London"
          onChange={mockOnChange}
        />
      );

      // Should show timezone with offset
      expect(screen.getByText(/Europe \/ London/)).toBeInTheDocument();
      expect(screen.getByText(/GMT/)).toBeInTheDocument();
    });
  });

  describe('dropdown behavior', () => {
    it('opens dropdown on click', async () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      // Dropdown should be open with search input
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search timezone...')).toBeInTheDocument();
      });
    });

    it('shows timezone options when dropdown is open', async () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        // Should show some common timezones
        expect(screen.getByText(/America \/ New York/)).toBeInTheDocument();
      });
    });
  });

  describe('selection', () => {
    it('calls onChange when a timezone is selected', async () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByText(/America \/ New York/)).toBeInTheDocument();
      });

      await user.click(screen.getByText(/America \/ New York/));

      expect(mockOnChange).toHaveBeenCalledWith('America/New_York');
    });

    it('closes dropdown after selection', async () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search timezone...')).toBeInTheDocument();
      });

      await user.click(screen.getByText(/America \/ New York/));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Search timezone...')).not.toBeInTheDocument();
      });
    });
  });

  describe('search functionality', () => {
    it('filters timezones based on search input', async () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      await user.click(screen.getByRole('combobox'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search timezone...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search timezone...');
      await user.type(searchInput, 'Tokyo');

      await waitFor(() => {
        expect(screen.getByText(/Asia \/ Tokyo/)).toBeInTheDocument();
      });
    });
  });

  describe('disabled state', () => {
    it('disables the trigger when disabled prop is true', () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
          disabled
        />
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeDisabled();
    });

    it('does not open dropdown when disabled', async () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
          disabled
        />
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      // Dropdown should not open
      expect(screen.queryByPlaceholderText('Search timezone...')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has correct aria attributes', () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('updates aria-expanded when open', async () => {
      render(
        <TimezoneSelector
          value=""
          onChange={mockOnChange}
        />
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      await waitFor(() => {
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
      });
    });
  });
});
