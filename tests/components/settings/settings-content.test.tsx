import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsContent } from "@/components/settings/settings-content";

const { mockSetWeekStart, mockSetWeightUnit, mockLocalization } = vi.hoisted(() => ({
  mockSetWeekStart: vi.fn(),
  mockSetWeightUnit: vi.fn(),
  mockLocalization: {
    weekStart: "monday",
    acceptedWeekStart: { status: "ready", value: "monday" },
    isLoading: false,
    error: undefined as Error | undefined,
    setWeekStart: vi.fn(),
  },
}));

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
    value,
    onChange,
  }: {
    value: number;
    onChange: (value: number) => void;
  }) => <button data-week-start={value} onClick={() => onChange(0)}>choose-sunday</button>,
}));
vi.mock("@/components/settings/weight-unit-selector", () => ({
  WeightUnitSelector: ({
    onChange,
  }: {
    onChange: (value: "kg" | "lbs") => void;
  }) => <button onClick={() => onChange("lbs")}>choose-lbs</button>,
}));

vi.mock("@/lib/hooks/use-profile-preferences", () => ({
  useFitnessPreference: () => ({
    weightUnit: { status: "ready", value: "kg" },
    acceptedWeightUnit: { status: "ready", value: "kg" },
    isLoading: false,
    error: undefined,
    setWeightUnit: mockSetWeightUnit,
  }),
}));

vi.mock("@/lib/hooks/use-localization", () => ({
  useLocalization: () => mockLocalization,
}));

describe("SettingsContent preference intents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockLocalization, {
      weekStart: "monday",
      acceptedWeekStart: { status: "ready", value: "monday" },
      isLoading: false,
      error: undefined,
      setWeekStart: mockSetWeekStart,
    });
    mockSetWeekStart.mockResolvedValue({});
    mockSetWeightUnit.mockResolvedValue({});
  });

  it("sends only the week-start key when only week start changed", async () => {
    render(<SettingsContent />);

    fireEvent.click(screen.getByText("choose-sunday"));
    fireEvent.click(screen.getAllByText("save")[0]);

    await waitFor(() => expect(mockSetWeekStart).toHaveBeenCalledWith("sunday"));
    expect(mockSetWeightUnit).not.toHaveBeenCalled();
  });

  it("sends only the weight-unit key when only weight unit changed", async () => {
    render(<SettingsContent />);

    fireEvent.click(screen.getByText("choose-lbs"));
    fireEvent.click(screen.getAllByText("save")[1]);

    await waitFor(() => expect(mockSetWeightUnit).toHaveBeenCalledWith("lbs"));
    expect(mockSetWeekStart).not.toHaveBeenCalled();
  });

  it("keeps preference saves in independent owner sections", () => {
    render(<SettingsContent />);
    expect(screen.getAllByText("save")).toHaveLength(2);
  });

  it("keeps the Week Start section usable with an explicit Monday degraded presentation", () => {
    mockLocalization.error = new Error("Current Profile unavailable");

    render(<SettingsContent />);

    expect(screen.getByRole("button", { name: "choose-sunday" })).toHaveAttribute(
      "data-week-start",
      "1",
    );
  });
});
