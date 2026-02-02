import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignUpForm } from '@/components/sign-up-form';
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
const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

describe('SignUpForm', () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
  });

  it('renders sign up form with all elements', () => {
    render(<SignUpForm />);

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeInTheDocument();
    expect(screen.getByLabelText('repeatPassword')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /signUpButton/i })).toBeInTheDocument();
  });

  it('updates email, password, and repeat password fields on input', () => {
    render(<SignUpForm />);

    const emailInput = screen.getByLabelText('email') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('password') as HTMLInputElement;
    const repeatPasswordInput = screen.getByLabelText('repeatPassword') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(repeatPasswordInput, { target: { value: 'password123' } });

    expect(emailInput.value).toBe('test@example.com');
    expect(passwordInput.value).toBe('password123');
    expect(repeatPasswordInput.value).toBe('password123');
  });

  it('shows error when passwords do not match', async () => {
    render(<SignUpForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const repeatPasswordInput = screen.getByLabelText('repeatPassword');
    const submitButton = screen.getByRole('button', { name: /signUpButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(repeatPasswordInput, { target: { value: 'differentPassword' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('passwordsDoNotMatch')).toBeInTheDocument();
    });

    // Should not call signUp when passwords don't match
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('submits form with matching passwords', async () => {
    mockSignUp.mockResolvedValue({ error: null });

    render(<SignUpForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const repeatPasswordInput = screen.getByLabelText('repeatPassword');
    const submitButton = screen.getByRole('button', { name: /signUpButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(repeatPasswordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          emailRedirectTo: expect.stringContaining('/dashboard'),
        },
      });
    });
  });

  it('redirects to sign-up-success on successful sign up', async () => {
    mockSignUp.mockResolvedValue({ error: null });

    render(<SignUpForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const repeatPasswordInput = screen.getByLabelText('repeatPassword');
    const submitButton = screen.getByRole('button', { name: /signUpButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(repeatPasswordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/auth/sign-up-success');
    });
  });

  it('displays error message on sign up failure', async () => {
    const error = new Error('Email already registered');
    mockSignUp.mockResolvedValue({ error });

    render(<SignUpForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const repeatPasswordInput = screen.getByLabelText('repeatPassword');
    const submitButton = screen.getByRole('button', { name: /signUpButton/i });

    fireEvent.change(emailInput, { target: { value: 'existing@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(repeatPasswordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Email already registered')).toBeInTheDocument();
    });
  });

  it('disables form during submission', async () => {
    mockSignUp.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
    );

    render(<SignUpForm />);

    const emailInput = screen.getByLabelText('email');
    const passwordInput = screen.getByLabelText('password');
    const repeatPasswordInput = screen.getByLabelText('repeatPassword');
    const submitButton = screen.getByRole('button', { name: /signUpButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.change(repeatPasswordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);

    // Should be disabled during submission
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('handles Google sign-up', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null });

    render(<SignUpForm />);

    const googleButton = screen.getByText(/continueWithGoogle/i);
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

  it('shows error on Google sign-up failure', async () => {
    const error = new Error('OAuth error');
    mockSignInWithOAuth.mockResolvedValue({ error });

    render(<SignUpForm />);

    const googleButton = screen.getByText(/continueWithGoogle/i);
    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(screen.getByText('OAuth error')).toBeInTheDocument();
    });
  });

  it('has link to login page', () => {
    render(<SignUpForm />);

    const loginLink = screen.getByText('login');
    expect(loginLink).toHaveAttribute('href', '/auth/login');
  });

  it('applies custom className', () => {
    const { container } = render(<SignUpForm className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
