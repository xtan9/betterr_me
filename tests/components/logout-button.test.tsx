import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LogoutButton } from '@/components/logout-button';
import { useRouter } from 'next/navigation';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock Supabase client
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
    },
  }),
}));

describe('LogoutButton', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('renders logout button', () => {
    render(<LogoutButton />);

    expect(screen.getByRole('button', { name: /signOut/i })).toBeInTheDocument();
  });

  it('calls signOut and redirects to login on click', async () => {
    mockSignOut.mockResolvedValue({ error: null });

    render(<LogoutButton />);

    const logoutButton = screen.getByRole('button', { name: /signOut/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });
  });

  it('calls router.push after signOut completes', async () => {
    mockSignOut.mockResolvedValue({ error: null });

    render(<LogoutButton />);

    const logoutButton = screen.getByRole('button', { name: /signOut/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });

    // Verify order: signOut before push
    expect(mockSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      mockPush.mock.invocationCallOrder[0]
    );
  });

  it('displays translated text for sign out', () => {
    render(<LogoutButton />);

    // The translation key 'signOut' from nav namespace should be rendered
    expect(screen.getByText('signOut')).toBeInTheDocument();
  });
});
