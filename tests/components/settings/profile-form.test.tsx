import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Namespace-aware mock matching next-intl's useTranslations behavior
const allTranslations: Record<string, Record<string, string>> = {
  'settings.profile': {
    'title': 'Profile',
    'description': 'Manage your personal information',
    'fullName': 'Display Name',
    'fullNamePlaceholder': 'Enter your name',
    'email': 'Email',
    'emailDescription': 'Your email address cannot be changed here',
    'avatarUrl': 'Avatar URL',
    'avatarUrlPlaceholder': 'https://example.com/avatar.jpg',
    'save': 'Save Profile',
    'saving': 'Saving...',
    'success': 'Profile updated successfully',
    'error': 'Failed to update profile',
  },
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const ns = allTranslations[namespace] ?? {};
    return (key: string) => {
      return ns[key] ?? key;
    };
  },
}));

// Mock SWR
const mockMutate = vi.fn();
vi.mock('swr', () => ({
  default: vi.fn(),
}));

import useSWR from 'swr';
import { ProfileForm } from '@/components/settings/profile-form';

const mockProfile = {
  id: 'user-1',
  email: 'test@example.com',
  full_name: 'John Doe',
  avatar_url: 'https://example.com/avatar.jpg',
  preferences: { date_format: 'YYYY-MM-DD', week_start_day: 0, theme: 'system' as const },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('ProfileForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: { profile: mockProfile },
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);
  });

  it('renders loading skeleton while profile is loading', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<ProfileForm />);
    expect(screen.getByTestId('profile-form-skeleton')).toBeInTheDocument();
  });

  it('renders form with pre-populated profile data', () => {
    render(<ProfileForm />);

    expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('https://example.com/avatar.jpg')).toBeInTheDocument();
  });

  it('email field is disabled', () => {
    render(<ProfileForm />);

    const emailInput = screen.getByDisplayValue('test@example.com');
    expect(emailInput).toBeDisabled();
  });

  it('save button disabled when no changes made', () => {
    render(<ProfileForm />);

    const saveButton = screen.getByRole('button', { name: 'Save Profile' });
    expect(saveButton).toBeDisabled();
  });

  it('save button enabled when name is changed', async () => {
    render(<ProfileForm />);

    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const saveButton = screen.getByRole('button', { name: 'Save Profile' });
    expect(saveButton).not.toBeDisabled();
  });

  it('validates name max length (100 chars)', async () => {
    render(<ProfileForm />);

    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'a'.repeat(101));

    const saveButton = screen.getByRole('button', { name: 'Save Profile' });
    await user.click(saveButton);

    await waitFor(() => {
      // Form should show validation error and not call fetch
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('validates avatar URL format', async () => {
    render(<ProfileForm />);

    const avatarInput = screen.getByDisplayValue('https://example.com/avatar.jpg');
    await user.clear(avatarInput);
    await user.type(avatarInput, 'not-a-url');

    // Change name too so save is enabled
    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');

    const saveButton = screen.getByRole('button', { name: 'Save Profile' });
    await user.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('saves profile successfully', async () => {
    mockMutate.mockResolvedValue(undefined);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: { ...mockProfile, full_name: 'Jane Doe' } }),
    } as Response);

    render(<ProfileForm />);

    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Profile updated successfully');
  });

  it('shows error toast on save failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    } as Response);

    render(<ProfileForm />);

    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to update profile');
    });
  });

  it('accepts empty avatar URL', async () => {
    mockMutate.mockResolvedValue(undefined);
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ profile: { ...mockProfile, avatar_url: null } }),
    } as Response);

    render(<ProfileForm />);

    const avatarInput = screen.getByDisplayValue('https://example.com/avatar.jpg');
    await user.clear(avatarInput);

    // Also change name to enable save
    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated');

    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
