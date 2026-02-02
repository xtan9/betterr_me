import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UpdatePasswordForm } from '@/components/update-password-form';
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
const mockUpdateUser = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      updateUser: mockUpdateUser,
    },
  }),
}));

describe('UpdatePasswordForm', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('renders update password form with all elements', () => {
    render(<UpdatePasswordForm />);

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /updateButton/i })).toBeInTheDocument();
  });

  it('updates password field on input', () => {
    render(<UpdatePasswordForm />);

    const passwordInput = screen.getByLabelText('password') as HTMLInputElement;

    fireEvent.change(passwordInput, { target: { value: 'newPassword123' } });

    expect(passwordInput.value).toBe('newPassword123');
  });

  it('submits form with new password', async () => {
    mockUpdateUser.mockResolvedValue({ error: null });

    render(<UpdatePasswordForm />);

    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /updateButton/i });

    fireEvent.change(passwordInput, { target: { value: 'newPassword123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newPassword123' });
    });
  });

  it('redirects to dashboard on successful password update', async () => {
    mockUpdateUser.mockResolvedValue({ error: null });

    render(<UpdatePasswordForm />);

    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /updateButton/i });

    fireEvent.change(passwordInput, { target: { value: 'newPassword123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error message on update failure', async () => {
    const error = new Error('Password too weak');
    mockUpdateUser.mockResolvedValue({ error });

    render(<UpdatePasswordForm />);

    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /updateButton/i });

    fireEvent.change(passwordInput, { target: { value: 'weak' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Password too weak')).toBeInTheDocument();
    });
  });

  it('disables form during submission', async () => {
    mockUpdateUser.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
    );

    render(<UpdatePasswordForm />);

    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /updateButton/i });

    fireEvent.change(passwordInput, { target: { value: 'newPassword123' } });
    fireEvent.click(submitButton);

    // Should be disabled during submission
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('shows loading text during submission', async () => {
    mockUpdateUser.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
    );

    render(<UpdatePasswordForm />);

    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /updateButton/i });

    fireEvent.change(passwordInput, { target: { value: 'newPassword123' } });
    fireEvent.click(submitButton);

    // Should show loading text during submission
    expect(screen.getByText('updating')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<UpdatePasswordForm className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('displays generic error for non-Error exceptions', async () => {
    mockUpdateUser.mockRejectedValue('Unknown error');

    render(<UpdatePasswordForm />);

    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /updateButton/i });

    fireEvent.change(passwordInput, { target: { value: 'newPassword123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('generic')).toBeInTheDocument();
    });
  });
});
