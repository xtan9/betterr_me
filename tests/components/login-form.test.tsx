import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '@/components/login-form';
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
const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

describe('LoginForm', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('renders login form with all elements', () => {
    render(<LoginForm />);

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('updates email and password fields on input', () => {
    render(<LoginForm />);

    const emailInput = screen.getByLabelText('email') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('password') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
  });

  it('submits form with email and password', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /login/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('redirects to dashboard on successful login', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null });

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /login/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays error message on login failure', async () => {
    const error = new Error('Invalid credentials');
    mockSignInWithPassword.mockResolvedValue({ error });

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /login/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });

  it('disables form during submission', async () => {
    mockSignInWithPassword.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
    );

    render(<LoginForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const submitButton = screen.getByRole('button', { name: /login/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    // Should be disabled during submission
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('handles Google sign-in', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    render(<LoginForm />);

    const googleButton = screen.getByText(/google/i);
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: expect.stringContaining('/auth/callback'),
        },
      });
    });
  });

  it('shows error on Google sign-in failure', async () => {
    const error = new Error('OAuth error');
    mockSignInWithOAuth.mockResolvedValue({ error });

    render(<LoginForm />);

    const googleButton = screen.getByText(/google/i);
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(screen.getByText('OAuth error')).toBeInTheDocument();
    });
  });

  it('has link to forgot password page', () => {
    render(<LoginForm />);

    const forgotPasswordLink = screen.getByText(/forgotPassword/i);
    expect(forgotPasswordLink).toHaveAttribute('href', '/auth/forgot-password');
  });

  it('has link to sign up page', () => {
    render(<LoginForm />);

    const signUpLink = screen.getByText(/signUp/i);
    expect(signUpLink).toHaveAttribute('href', '/auth/sign-up');
  });
});
