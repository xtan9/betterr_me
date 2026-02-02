import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageSwitcher } from '@/components/language-switcher';

// Mock next-intl
let mockLocale = 'en';

vi.mock('next-intl', () => ({
  useLocale: () => mockLocale,
}));

// Mock window.location.reload
const mockReload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { reload: mockReload },
  writable: true,
});

describe('LanguageSwitcher', () => {
  let originalCookie: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocale = 'en';
    originalCookie = document.cookie;
    // Clear cookies
    document.cookie = 'locale=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  afterEach(() => {
    document.cookie = originalCookie;
  });

  it('renders language switcher button', () => {
    render(<LanguageSwitcher />);

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.getByText('Toggle language')).toBeInTheDocument();
  });

  it('opens dropdown menu on click', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('English')).toBeInTheDocument();
      expect(screen.getByText('简体中文')).toBeInTheDocument();
      expect(screen.getByText('繁體中文')).toBeInTheDocument();
    });
  });

  it('highlights current locale (English)', async () => {
    const user = userEvent.setup();
    mockLocale = 'en';
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const englishItem = screen.getByText('English');
      expect(englishItem).toHaveClass('font-semibold');
    });
  });

  it('highlights current locale (Chinese Simplified)', async () => {
    const user = userEvent.setup();
    mockLocale = 'zh';
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const chineseItem = screen.getByText('简体中文');
      expect(chineseItem).toHaveClass('font-semibold');
    });
  });

  it('highlights current locale (Chinese Traditional)', async () => {
    const user = userEvent.setup();
    mockLocale = 'zh-TW';
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      const chineseItem = screen.getByText('繁體中文');
      expect(chineseItem).toHaveClass('font-semibold');
    });
  });

  it('sets cookie and reloads when changing to Chinese', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('简体中文')).toBeInTheDocument();
    });

    await user.click(screen.getByText('简体中文'));

    await waitFor(() => {
      expect(document.cookie).toContain('locale=zh');
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it('sets cookie and reloads when changing to English', async () => {
    const user = userEvent.setup();
    mockLocale = 'zh';
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('English')).toBeInTheDocument();
    });

    await user.click(screen.getByText('English'));

    await waitFor(() => {
      expect(document.cookie).toContain('locale=en');
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it('sets cookie and reloads when changing to Traditional Chinese', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('繁體中文')).toBeInTheDocument();
    });

    await user.click(screen.getByText('繁體中文'));

    await waitFor(() => {
      expect(document.cookie).toContain('locale=zh-TW');
      expect(mockReload).toHaveBeenCalled();
    });
  });

  it('has accessible label for screen readers', () => {
    render(<LanguageSwitcher />);

    expect(screen.getByText('Toggle language')).toHaveClass('sr-only');
  });

  it('renders button with correct aria attributes', () => {
    render(<LanguageSwitcher />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
