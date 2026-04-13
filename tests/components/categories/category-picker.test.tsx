import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { CategoryPicker } from "@/components/categories/category-picker";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const { mockMutate, mockCategoriesHook } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
  mockCategoriesHook: vi.fn(),
}));

vi.mock("@/lib/hooks/use-categories", () => ({
  useCategories: mockCategoriesHook,
}));

describe("CategoryPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCategoriesHook.mockReturnValue({
      categories: [
        { id: "c1", name: "Work", color: "blue" },
        { id: "c2", name: "Personal", color: "green" },
      ],
      mutate: mockMutate,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a toggle for each category and an add button", () => {
    render(<CategoryPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add/i })).toBeInTheDocument();
  });

  it("calls onChange with category id when toggle is pressed", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CategoryPicker value={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Work/i }));
    expect(onChange).toHaveBeenCalledWith("c1");
  });

  it("calls onChange with null when the selected toggle is pressed again", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CategoryPicker value="c1" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Work/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("POSTs to /api/categories and selects the created category", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ category: { id: "c-new", name: "Hobbies", color: "blue" } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CategoryPicker value={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    const input = await screen.findByPlaceholderText("namePlaceholder");
    await user.type(input, "Hobbies");
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/categories",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Hobbies", color: "blue" }),
        }),
      );
    });
    expect(onChange).toHaveBeenCalledWith("c-new");
    expect(mockMutate).toHaveBeenCalled();
  });

  it("shows an error toast when the create request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<CategoryPicker value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    const input = await screen.findByPlaceholderText("namePlaceholder");
    await user.type(input, "Fail");
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("createError");
    });
  });

  it("disables create button when name is blank", async () => {
    const user = userEvent.setup();
    render(<CategoryPicker value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /add/i }));
    const createBtn = await screen.findByRole("button", { name: "create" });
    expect(createBtn).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<CategoryPicker value="c1" onChange={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
