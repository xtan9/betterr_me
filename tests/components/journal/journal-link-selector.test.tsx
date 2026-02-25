import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JournalLinkSelector } from "@/components/journal/journal-link-selector";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockHabits = [
  { id: "h-1", name: "Morning Run" },
  { id: "h-2", name: "Read Books" },
];

const mockTasks = [
  { id: "t-1", title: "Buy groceries" },
  { id: "t-2", title: "Finish report" },
];

vi.mock("@/lib/hooks/use-habits", () => ({
  useHabits: () => ({
    habits: mockHabits,
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (key && key.includes("/api/tasks")) {
      return { data: { tasks: mockTasks }, error: null, isLoading: false };
    }
    return { data: null, error: null, isLoading: false };
  },
}));

vi.mock("@/lib/hooks/use-journal-links", () => ({
  addLink: vi.fn().mockResolvedValue(undefined),
  removeLink: vi.fn().mockResolvedValue(undefined),
}));

describe("JournalLinkSelector", () => {
  const defaultProps = {
    entryId: "entry-1",
    existingLinks: [] as Array<{ link_type: "habit" | "task" | "project"; link_id: string }>,
    onLinkAdded: vi.fn(),
    onLinkRemoved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders trigger button", () => {
    render(<JournalLinkSelector {...defaultProps} />);
    expect(screen.getByTestId("link-selector-trigger")).toBeInTheDocument();
    expect(screen.getByTestId("link-selector-trigger")).toHaveTextContent("addLink");
  });

  it("opens popover on click showing search input", async () => {
    const user = userEvent.setup();
    render(<JournalLinkSelector {...defaultProps} />);

    await user.click(screen.getByTestId("link-selector-trigger"));
    expect(screen.getByTestId("link-search-input")).toBeInTheDocument();
  });

  it("shows habits and tasks in the dropdown", async () => {
    const user = userEvent.setup();
    render(<JournalLinkSelector {...defaultProps} />);

    await user.click(screen.getByTestId("link-selector-trigger"));
    expect(screen.getByTestId("link-habit-h-1")).toBeInTheDocument();
    expect(screen.getByTestId("link-habit-h-2")).toBeInTheDocument();
    expect(screen.getByTestId("link-task-t-1")).toBeInTheDocument();
    expect(screen.getByTestId("link-task-t-2")).toBeInTheDocument();
  });

  it("filters items by search text", async () => {
    const user = userEvent.setup();
    render(<JournalLinkSelector {...defaultProps} />);

    await user.click(screen.getByTestId("link-selector-trigger"));
    await user.type(screen.getByTestId("link-search-input"), "run");

    expect(screen.getByTestId("link-habit-h-1")).toBeInTheDocument();
    expect(screen.queryByTestId("link-habit-h-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("link-task-t-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("link-task-t-2")).not.toBeInTheDocument();
  });

  it("hides already-linked items", async () => {
    const user = userEvent.setup();
    render(
      <JournalLinkSelector
        {...defaultProps}
        existingLinks={[{ link_type: "habit", link_id: "h-1" }]}
      />,
    );

    await user.click(screen.getByTestId("link-selector-trigger"));
    expect(screen.queryByTestId("link-habit-h-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("link-habit-h-2")).toBeInTheDocument();
  });

  it("shows no results when search matches nothing", async () => {
    const user = userEvent.setup();
    render(<JournalLinkSelector {...defaultProps} />);

    await user.click(screen.getByTestId("link-selector-trigger"));
    await user.type(screen.getByTestId("link-search-input"), "zzzzz");

    expect(screen.getByTestId("link-no-results")).toBeInTheDocument();
  });
});
