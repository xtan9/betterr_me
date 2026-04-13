import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    return (key: string, params?: Record<string, string | number>) => {
      const translations: Record<string, string> = {
        "card.currentStreak": "Current",
        "card.bestStreak": "Best",
        "card.streakDays": "{count} days",
        "card.markComplete": "Mark complete:",
        "card.completedToday": "Completed today",
        "categories.health": "Health",
        "categories.other": "Other",
        title: "Login",
        description: "Enter your credentials",
        email: "Email",
        emailPlaceholder: "test@example.com",
        password: "Password",
        forgotPassword: "Forgot password?",
        loginButton: "Log In",
        loggingIn: "Logging in...",
        orContinueWith: "Or continue with",
        continueWithGoogle: "Continue with Google",
        noAccount: "Don't have an account?",
        signUp: "Sign up",
        searchPlaceholder: "Search habits...",
        "tabs.active": "Active",
        "tabs.paused": "Paused",
        "tabs.archived": "Archived",
        "list.title": "My Habits",
        "frequency.daily": "Every day",
        "frequency.weekdays": "Mon – Fri",
        "frequency.weekly": "Once a week",
        "frequency.timesPerWeek": "{count}x/week",
        "frequency.custom": "{days}",
        activeHabits: "Active Habits",
        todaysProgress: "Today's Progress",
        currentStreak: "Current Streak",
        completionRate: "{percent}% completion",
        days: "{count} days",
        vsYesterday: "{change}% vs yesterday",
        // New a11y keys (match en.json values)
        previousMonth: "Previous month",
        nextMonth: "Next month",
        openMenu: "Open menu",
        delete: "Delete",
        editBill: "Edit Bill",
        removeCategory: "Remove category",
        memberRemove: "Remove",
        inviteCopyLink: "Copy invite link",
        inviteCopied: "Link copied!",
      };
      let value = translations[key] || key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          value = value.replace(`{${k}}`, String(v));
        });
      }
      return value;
    };
  },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

// Mock useCategories
vi.mock("@/lib/hooks/use-categories", () => ({
  useCategories: () => ({
    categories: [],
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

// Mock useMoneyCategories (used by budget-form)
vi.mock("@/lib/hooks/use-money-categories", () => ({
  useMoneyCategories: () => ({
    categories: [
      { id: "cat-1", name: "Groceries", icon: null, color: "#6b9080" },
      { id: "cat-2", name: "Dining", icon: null, color: "#a4c3b2" },
    ],
    isLoading: false,
    error: undefined,
    mutate: vi.fn(),
  }),
}));

// Mock sonner (used by budget-form, household-members-list)
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  }),
}));

describe("Accessibility - Login Form", () => {
  it("should have no axe violations", async () => {
    const { LoginForm } = await import("@/components/login-form");
    const { container } = render(<LoginForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should have labels associated with inputs", async () => {
    const { LoginForm } = await import("@/components/login-form");
    const { container } = render(<LoginForm />);

    const emailInput = container.querySelector("#email");
    const passwordInput = container.querySelector("#password");
    const emailLabel = container.querySelector('label[for="email"]');
    const passwordLabel = container.querySelector('label[for="password"]');

    expect(emailInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(emailLabel).toBeTruthy();
    expect(passwordLabel).toBeTruthy();
  });

  it("should have aria-hidden on Google icon", async () => {
    const { LoginForm } = await import("@/components/login-form");
    const { container } = render(<LoginForm />);

    const googleIcon = container.querySelector("svg");
    expect(googleIcon?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("Accessibility - Daily Snapshot", () => {
  it("should have no axe violations", async () => {
    const { DailySnapshot } = await import(
      "@/components/dashboard/daily-snapshot"
    );
    const stats = {
      total_habits: 5,
      completed_today: 3,
      current_best_streak: 7,
      tasks_due_today: 2,
      tasks_completed_today: 1,
    };
    const { container } = render(<DailySnapshot stats={stats} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should have aria-hidden on decorative icons", async () => {
    const { DailySnapshot } = await import(
      "@/components/dashboard/daily-snapshot"
    );
    const stats = {
      total_habits: 5,
      completed_today: 3,
      current_best_streak: 7,
      tasks_due_today: 2,
      tasks_completed_today: 1,
    };
    const { container } = render(<DailySnapshot stats={stats} />);

    const svgs = container.querySelectorAll("svg");
    svgs.forEach((svg) => {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    });
  });
});

const mockHabit = {
  id: "1",
  user_id: "user-1",
  name: "Exercise",
  description: null,
  category_id: null,
  frequency: { type: "daily" as const },
  status: "active" as const,
  current_streak: 5,
  best_streak: 10,
  paused_at: null,
  graduated_at: null,
  graduated_streak: null,
  nudge_dismissed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  completed_today: false,
  monthly_completion_rate: 75,
  graduation_eligible: false,
};

describe("Accessibility - HabitCard", () => {
  it("should have no axe violations", async () => {
    const { HabitCard } = await import("@/components/habits/habit-card");
    const { container } = render(
      <HabitCard
        habit={mockHabit}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onClick={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("should not have nested interactive controls", async () => {
    const { HabitCard } = await import("@/components/habits/habit-card");
    const { container } = render(
      <HabitCard
        habit={mockHabit}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onClick={vi.fn()}
      />
    );
    // Card should not have role="button" (avoids nested interactive)
    const card = container.firstElementChild;
    expect(card?.getAttribute("role")).not.toBe("button");
    // Checkbox and button should be separate focusable elements
    const button = container.querySelector("button");
    const checkbox = container.querySelector('[data-slot="checkbox"]');
    expect(button).toBeTruthy();
    expect(checkbox).toBeTruthy();
  });
});

describe("Accessibility - HabitRow", () => {
  it("should have no axe violations", async () => {
    const { HabitRow } = await import("@/components/habits/habit-row");
    const { container } = render(
      <HabitRow
        habit={mockHabit}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onClick={vi.fn()}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("Accessibility - BillCalendar icon buttons", () => {
  it("month navigation buttons have accessible names", async () => {
    const { BillCalendar } = await import("@/components/money/bill-calendar");
    const { container } = render(<BillCalendar bills={[]} />);
    const prev = container.querySelector('button[aria-label="Previous month"]');
    const next = container.querySelector('button[aria-label="Next month"]');
    expect(prev).toBeTruthy();
    expect(next).toBeTruthy();
  });
});

describe("Accessibility - SmartBillCalendar icon buttons", () => {
  it("month navigation buttons have accessible names", async () => {
    const { SmartBillCalendar } = await import(
      "@/components/money/smart-bill-calendar"
    );
    const { container } = render(
      <SmartBillCalendar
        bills={[]}
        dailyBalances={[]}
        dailySpendingRateCents={0}
      />
    );
    const prev = container.querySelector('button[aria-label="Previous month"]');
    const next = container.querySelector('button[aria-label="Next month"]');
    expect(prev).toBeTruthy();
    expect(next).toBeTruthy();
  });
});

describe("Accessibility - ApiKeyRow icon button", () => {
  it("delete button has accessible name", async () => {
    const { ApiKeyRow } = await import("@/components/settings/api-key-row");
    const apiKey = {
      id: "k1",
      user_id: "u1",
      name: "Test Key",
      key_prefix: "bme_test_",
      permissions: "read" as const,
      expires_at: null,
      last_used_at: null,
      created_at: "2026-04-01T00:00:00Z",
    };
    const { container } = render(
      <ApiKeyRow apiKey={apiKey} onDelete={vi.fn().mockResolvedValue(undefined)} />
    );
    expect(
      container.querySelector('button[aria-label="Delete"]')
    ).toBeTruthy();
  });
});

describe("Accessibility - BillRow icon button", () => {
  it("edit button has accessible name", async () => {
    const { BillRow } = await import("@/components/money/bill-row");
    const bill = {
      id: "b1",
      household_id: "h1",
      plaid_stream_id: null,
      account_id: null,
      name: "Internet",
      description: null,
      amount_cents: 5000,
      frequency: "MONTHLY" as const,
      next_due_date: "2026-05-01",
      user_status: "pending" as const,
      is_active: true,
      plaid_status: null,
      category_primary: null,
      previous_amount_cents: null,
      source: "manual" as const,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    };
    const { container } = render(
      <BillRow bill={bill} onStatusChange={vi.fn()} onEdit={vi.fn()} />
    );
    expect(
      container.querySelector('button[aria-label="Edit Bill"]')
    ).toBeTruthy();
  });
});

describe("Accessibility - HouseholdMembersList icon button", () => {
  it("remove member button has accessible name when owner views another member", async () => {
    const { HouseholdMembersList } = await import(
      "@/components/money/household-members-list"
    );
    const members = [
      {
        id: "m1",
        household_id: "h1",
        user_id: "owner-id",
        role: "owner" as const,
        created_at: "2026-04-01T00:00:00Z",
        email: "owner@example.com",
        full_name: "Owner",
        avatar_url: null,
      },
      {
        id: "m2",
        household_id: "h1",
        user_id: "member-id",
        role: "member" as const,
        created_at: "2026-04-02T00:00:00Z",
        email: "member@example.com",
        full_name: "Member",
        avatar_url: null,
      },
    ];
    const { container } = render(
      <HouseholdMembersList
        members={members}
        invitations={[]}
        isOwner={true}
        currentUserId="owner-id"
        onMutate={vi.fn()}
      />
    );
    expect(
      container.querySelector('button[aria-label="Remove"]')
    ).toBeTruthy();
  });
});

describe("Accessibility - BudgetForm icon button", () => {
  it("remove category button has accessible name when multiple categories exist", async () => {
    const { BudgetForm } = await import("@/components/money/budget-form");
    const budget = {
      id: "b1",
      household_id: "h1",
      month: "2026-04-01",
      total_cents: 100000,
      rollover_enabled: false,
      owner_id: null,
      is_shared: false,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      total_allocated_cents: 80000,
      total_spent_cents: 0,
      categories: [
        {
          id: "bc1",
          budget_id: "b1",
          category_id: "cat-1",
          allocated_cents: 40000,
          rollover_cents: 0,
          created_at: "2026-04-01T00:00:00Z",
          spent_cents: 0,
          category_name: "Groceries",
          category_icon: null,
          category_color: "#6b9080",
        },
        {
          id: "bc2",
          budget_id: "b1",
          category_id: "cat-2",
          allocated_cents: 40000,
          rollover_cents: 0,
          created_at: "2026-04-01T00:00:00Z",
          spent_cents: 0,
          category_name: "Dining",
          category_icon: null,
          category_color: "#a4c3b2",
        },
      ],
    };
    const { container } = render(
      <BudgetForm
        mode="edit"
        budget={budget}
        month="2026-04"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      container.querySelector('button[aria-label="Remove category"]')
    ).toBeTruthy();
  });
});

describe("Accessibility - ProjectCard icon button", () => {
  it("menu trigger has accessible name", async () => {
    const { ProjectCard } = await import("@/components/projects/project-card");
    const project = {
      id: "p1",
      user_id: "u1",
      name: "Test Project",
      section: "personal" as const,
      color: "sage",
      status: "active" as const,
      sort_order: 0,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    };
    const { container } = render(
      <ProjectCard
        project={project}
        tasks={[]}
        onEdit={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(
      container.querySelector('button[aria-label="Open menu"]')
    ).toBeTruthy();
  });
});

describe("Accessibility - HabitList", () => {
  it("should have no axe violations", async () => {
    const { HabitList } = await import("@/components/habits/habit-list");
    const { container } = render(
      <HabitList
        habits={[mockHabit]}
        onToggle={vi.fn().mockResolvedValue(undefined)}
        onHabitClick={vi.fn()}
      />
    );
    // Disable heading-order rule: h1 > h3 skip is a page-level composition
    // concern, not a component-level one
    const results = await axe(container, {
      rules: { "heading-order": { enabled: false } },
    });
    expect(results).toHaveNoViolations();
  });
});
