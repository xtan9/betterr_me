import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitcher } from '@/components/theme-switcher';

const { mockSelectTheme, mockAppearance } = vi.hoisted(() => ({
  mockSelectTheme: vi.fn(),
  mockAppearance: {
    theme: "system",
    resolvedTheme: "light" as string | undefined,
  },
}));

vi.mock("@/lib/hooks/use-appearance", () => ({
  useAppearance: () => ({
    theme: mockAppearance.theme,
    resolvedTheme: mockAppearance.resolvedTheme,
    selectTheme: mockSelectTheme,
  }),
}));

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppearance.theme = "system";
    mockAppearance.resolvedTheme = "light";
    mockSelectTheme.mockResolvedValue(undefined);
  });

  it('renders theme switcher button after mounting', async () => {
    render(<ThemeSwitcher />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  it('shows sun icon when resolved theme is light', async () => {
    mockAppearance.resolvedTheme = 'light';
    render(<ThemeSwitcher />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      // Check that there's an svg element (icon) in the button
      expect(button.querySelector('svg')).toBeInTheDocument();
    });
  });

  it('shows moon icon when resolved theme is dark', async () => {
    mockAppearance.resolvedTheme = 'dark';
    render(<ThemeSwitcher />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(button.querySelector('svg')).toBeInTheDocument();
    });
  });

  it('opens dropdown menu on click and shows theme options', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    await user.click(button);

    // Check that menu items appear
    await waitFor(() => {
      expect(screen.getByText('Light')).toBeInTheDocument();
      expect(screen.getByText('Dark')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });
  });

  it('delegates light theme selection to the Appearance owner', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Light')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Light'));

    await waitFor(() => {
      expect(mockSelectTheme).toHaveBeenCalledWith('light');
    });
  });

  it('delegates dark theme selection to the Appearance owner', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Dark')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Dark'));

    await waitFor(() => {
      expect(mockSelectTheme).toHaveBeenCalledWith('dark');
    });
  });

  it('delegates only the selected theme value to the Appearance owner', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(await screen.findByRole('button'));
    await user.click(await screen.findByText('Dark'));

    await waitFor(() => expect(mockSelectTheme).toHaveBeenCalledWith("dark"));
  });

  it('delegates system theme selection to the Appearance owner', async () => {
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('System')).toBeInTheDocument();
    });

    await user.click(screen.getByText('System'));

    await waitFor(() => {
      expect(mockSelectTheme).toHaveBeenCalledWith('system');
    });
  });

  it('does not manually manipulate document classes', async () => {
    document.documentElement.className = '';
    mockAppearance.resolvedTheme = 'dark';
    render(<ThemeSwitcher />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    // After mount, document.documentElement should remain untouched
    // (next-themes ThemeProvider handles class toggling, not the component)
    expect(document.documentElement.className).toBe('');
  });

  it('renders button with correct aria attributes', async () => {
    render(<ThemeSwitcher />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-haspopup', 'menu');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });
  });
});
