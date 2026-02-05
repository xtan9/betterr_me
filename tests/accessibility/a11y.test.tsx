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
        activeHabits: "Active Habits",
        todaysProgress: "Today's Progress",
        currentStreak: "Current Streak",
        completionRate: "{percent}% completion",
        days: "{count} days",
        vsYesterday: "{change}% vs yesterday",
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

// Mock supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  }),
}));

// Mock child components for Navbar
vi.mock("@/components/auth-button", () => ({
  AuthButton: () => <button>Auth</button>,
}));
vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => <button>Language</button>,
}));
vi.mock("@/components/theme-switcher", () => ({
  ThemeSwitcher: () => <button>Theme</button>,
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

describe("Accessibility - Navbar", () => {
  it("should have aria-label on nav element", async () => {
    const Navbar = (await import("@/components/navbar")).default;
    const { container } = render(await Navbar());
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute("aria-label")).toBe("Main navigation");
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
