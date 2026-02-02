import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock Supabase client
const mockResetPasswordForEmail = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  }),
}));

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders forgot password form with all elements', () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sendButton/i })).toBeInTheDocument();
  });

  it('updates email field on input', () => {
    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('email') as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    expect(emailInput.value).toBe('test@example.com');
  });

  it('submits form with email', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('email');
    const submitButton = screen.getByRole('button', { name: /sendButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@example.com', {
        redirectTo: expect.stringContaining('/auth/update-password'),
      });
    });
  });

  it('shows success state after successful submission', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null });

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('email');
    const submitButton = screen.getByRole('button', { name: /sendButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('checkEmail')).toBeInTheDocument();
      expect(screen.getByText('instructionsSent')).toBeInTheDocument();
      expect(screen.getByText('emailSentMessage')).toBeInTheDocument();
    });
  });

  it('displays error message on failure', async () => {
    const error = new Error('Failed to send email');
    mockResetPasswordForEmail.mockResolvedValue({ error });

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('email');
    const submitButton = screen.getByRole('button', { name: /sendButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to send email')).toBeInTheDocument();
    });
  });

  it('disables form during submission', async () => {
    mockResetPasswordForEmail.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
    );

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('email');
    const submitButton = screen.getByRole('button', { name: /sendButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    // Should be disabled during submission
    expect(submitButton).toBeDisabled();

    await waitFor(() => {
      // After success, form switches to success state
      expect(screen.getByText('checkEmail')).toBeInTheDocument();
    });
  });

  it('shows loading text during submission', async () => {
    mockResetPasswordForEmail.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ error: null }), 100))
    );

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('email');
    const submitButton = screen.getByRole('button', { name: /sendButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    // Should show loading text during submission
    expect(screen.getByText('sending')).toBeInTheDocument();
  });

  it('has link to login page', () => {
    render(<ForgotPasswordForm />);

    const loginLink = screen.getByText('login');
    expect(loginLink).toHaveAttribute('href', '/auth/login');
  });

  it('applies custom className', () => {
    const { container } = render(<ForgotPasswordForm className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('displays generic error for non-Error exceptions', async () => {
    mockResetPasswordForEmail.mockRejectedValue('Unknown error');

    render(<ForgotPasswordForm />);

    const emailInput = screen.getByLabelText('email');
    const submitButton = screen.getByRole('button', { name: /sendButton/i });

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('generic')).toBeInTheDocument();
    });
  });
});
