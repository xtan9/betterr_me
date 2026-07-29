import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsContent } from "@/components/settings/settings-content";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/components/layouts/page-header", () => ({
  PageHeader: ({
    actions,
  }: {
    actions?: React.ReactNode;
  }) => <div>{actions}</div>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div />,
}));

vi.mock("@/components/settings/profile-form", () => ({
  ProfileForm: () => <div />,
}));
vi.mock("@/components/settings/data-export", () => ({
  DataExport: () => <div />,
}));
vi.mock("@/components/settings/notification-settings", () => ({
  NotificationSettings: () => <div />,
}));
vi.mock("@/components/settings/api-keys-section", () => ({
  ApiKeysSection: () => <div />,
}));
vi.mock("@/components/settings/week-start-selector", () => ({
  WeekStartSelector: ({
    onChange,
  }: {
    onChange: (value: number) => void;
  }) => <button onClick={() => onChange(0)}>choose-sunday</button>,
}));
vi.mock("@/components/settings/weight-unit-selector", () => ({
  WeightUnitSelector: ({
    onChange,
  }: {
    onChange: (value: "kg" | "lbs") => void;
  }) => <button onClick={() => onChange("lbs")}>choose-lbs</button>,
}));

const mockMutate = vi.fn();
vi.mock("swr", () => ({
  default: (
    _key: string,
    _fetcher: unknown,
    options: { fallbackData: unknown },
  ) => ({
    data: options.fallbackData,
    error: null,
    isLoading: false,
    mutate: mockMutate,
  }),
}));

const mockFetch = vi.fn();

const initialProfile = {
  profile: {
    id: "user-123",
    email: "person@example.test",
    full_name: "Person",
    preferences: {
      date_format: "MM/DD/YYYY",
      week_start_day: 1,
      theme: "system" as const,
      weight_unit: "kg" as const,
    },
  },
};

describe("SettingsContent preference intents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mockFetch);
    mockMutate.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(initialProfile),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends only the week-start key when only week start changed", async () => {
    render(<SettingsContent initialProfile={initialProfile} />);

    fireEvent.click(screen.getByText("choose-sunday"));
    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      week_start_day: 0,
    });
  });

  it("sends only the weight-unit key when only weight unit changed", async () => {
    render(<SettingsContent initialProfile={initialProfile} />);

    fireEvent.click(screen.getByText("choose-lbs"));
    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({
      weight_unit: "lbs",
    });
  });

  it("keeps the accepted cache outcome when revalidation fails", async () => {
    const accepted = {
      profile: {
        ...initialProfile.profile,
        full_name: "New server name",
        preferences: {
          ...initialProfile.profile.preferences,
          week_start_day: 0,
          theme: "dark" as const,
        },
      },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(accepted),
    });
    mockMutate
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("revalidation unavailable"));
    render(<SettingsContent initialProfile={initialProfile} />);

    fireEvent.click(screen.getByText("choose-sunday"));
    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(2));
    const [cacheUpdater, options] = mockMutate.mock.calls[0];
    expect(options).toEqual({ revalidate: false });
    expect(cacheUpdater()).toEqual(accepted);
    expect(screen.getByText("saved")).toBeInTheDocument();
  });
});
