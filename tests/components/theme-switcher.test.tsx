import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitcher } from '@/components/theme-switcher';

// Mock next-themes
const mockSetTheme = vi.fn();
const mockMutateProfile = vi.fn();
let mockTheme = 'system';
let mockResolvedTheme: string | undefined = 'light';
let mockProfileData: Record<string, unknown> | undefined;

vi.mock('swr', () => ({
  default: () => ({
    data: mockProfileData,
    error: undefined,
    mutate: mockMutateProfile,
  }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
    resolvedTheme: mockResolvedTheme,
  }),
}));

describe('ThemeSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'system';
    mockResolvedTheme = 'light';
    mockProfileData = undefined;
    mockMutateProfile.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        profile: { preferences: { theme: 'dark' } },
      }),
    }));
  });

  it('renders theme switcher button after mounting', async () => {
    render(<ThemeSwitcher />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  it('shows sun icon when resolved theme is light', async () => {
    mockResolvedTheme = 'light';
    render(<ThemeSwitcher />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      // Check that there's an svg element (icon) in the button
      expect(button.querySelector('svg')).toBeInTheDocument();
    });
  });

  it('shows moon icon when resolved theme is dark', async () => {
    mockResolvedTheme = 'dark';
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

  it('calls setTheme when light theme is selected', async () => {
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
      expect(mockSetTheme).toHaveBeenCalledWith('light');
    });
  });

  it('calls setTheme when dark theme is selected', async () => {
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
      expect(mockSetTheme).toHaveBeenCalledWith('dark');
    });
  });

  it('submits only the selected theme for an authenticated profile', async () => {
    mockProfileData = {
      profile: {
        preferences: { theme: 'system' },
      },
    };
    const user = userEvent.setup();
    render(<ThemeSwitcher />);

    await user.click(await screen.findByRole('button'));
    await user.click(await screen.findByText('Dark'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/profile/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: 'dark' }),
      });
    });
  });

  it('calls setTheme when system theme is selected', async () => {
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
      expect(mockSetTheme).toHaveBeenCalledWith('system');
    });
  });

  it('does not manually manipulate document classes', async () => {
    document.documentElement.className = '';
    mockResolvedTheme = 'dark';
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
