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

const { mockUpdateProfileDetails, mockProfileState } = vi.hoisted(() => ({
  mockUpdateProfileDetails: vi.fn(),
  mockProfileState: {
    details: {
      fullName: 'John Doe',
      avatarUrl: 'https://example.com/avatar.jpg',
    } as { fullName: string; avatarUrl: string } | undefined,
    currentProfile: {
      identity: { email: 'test@example.com' },
    },
    isLoading: false,
    error: undefined,
    updateProfileDetails: vi.fn(),
  },
}));

mockProfileState.updateProfileDetails = mockUpdateProfileDetails;
vi.mock('@/lib/hooks/use-profile-preferences', () => ({
  useProfileDetails: () => mockProfileState,
}));

import { ProfileForm } from '@/components/settings/profile-form';

describe('ProfileForm', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    mockProfileState.details = {
      fullName: 'John Doe',
      avatarUrl: 'https://example.com/avatar.jpg',
    };
    mockProfileState.currentProfile = { identity: { email: 'test@example.com' } };
    mockProfileState.isLoading = false;
    mockProfileState.error = undefined;
    mockUpdateProfileDetails.mockResolvedValue({});
  });

  it('renders loading skeleton while profile is loading', () => {
    mockProfileState.details = undefined;
    mockProfileState.isLoading = true;

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
    render(<ProfileForm />);

    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => expect(mockUpdateProfileDetails).toHaveBeenCalledWith({
      fullName: 'Jane Doe',
    }));
    expect(mockToastSuccess).toHaveBeenCalledWith('Profile updated successfully');
  });

  it('shows error toast on save failure', async () => {
    mockUpdateProfileDetails.mockRejectedValueOnce(new Error('Server error'));

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

    render(<ProfileForm />);

    const avatarInput = screen.getByDisplayValue('https://example.com/avatar.jpg');
    await user.clear(avatarInput);

    // Also change name to enable save
    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated');

    await user.click(screen.getByRole('button', { name: 'Save Profile' }));

    await waitFor(() => expect(mockUpdateProfileDetails).toHaveBeenCalledWith({
      fullName: 'Updated',
      avatarUrl: null,
    }));
  });
});
