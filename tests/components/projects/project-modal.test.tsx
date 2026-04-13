import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { toast } from "sonner";
import { ProjectModal } from "@/components/projects/project-modal";
import type { Project } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-7",
    user_id: "user-1",
    name: "Existing Project",
    section: "work",
    color: "red",
    status: "active",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("ProjectModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders create title, empty form, and Create button by default", () => {
    render(<ProjectModal open onOpenChange={() => {}} />);

    expect(screen.getByText("createTitle")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "createButton" })
    ).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText(
      "namePlaceholder"
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("");
  });

  it("renders edit title and pre-filled values when a project is provided", () => {
    render(
      <ProjectModal open onOpenChange={() => {}} project={makeProject()} />
    );

    expect(screen.getByText("editTitle")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "saveButton" })
    ).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText(
      "namePlaceholder"
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Existing Project");
  });

  it("does not render modal content when closed", () => {
    render(<ProjectModal open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText("createTitle")).not.toBeInTheDocument();
  });

  it("creates a project via POST /api/projects on submit and closes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(
      <ProjectModal
        open
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );

    await user.type(
      screen.getByPlaceholderText("namePlaceholder"),
      "My New Project"
    );
    await user.click(screen.getByRole("button", { name: "createButton" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/projects");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      name: "My New Project",
      section: "personal", // default
      color: "blue", // default
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("createSuccess");
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("edits a project via PATCH /api/projects/:id with updateSuccess toast", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(
      <ProjectModal
        open
        onOpenChange={() => {}}
        project={makeProject({ id: "proj-7" })}
      />
    );

    await user.click(screen.getByRole("button", { name: "saveButton" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/projects/proj-7");
    expect(init.method).toBe("PATCH");

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("updateSuccess");
    });
  });

  it("surfaces server-supplied error message", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Name already exists" }),
    });

    render(<ProjectModal open onOpenChange={() => {}} />);

    await user.type(
      screen.getByPlaceholderText("namePlaceholder"),
      "Duplicate"
    );
    await user.click(screen.getByRole("button", { name: "createButton" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Name already exists");
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("blocks submission when name is empty (zod validation)", async () => {
    const user = userEvent.setup();
    render(<ProjectModal open onOpenChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "createButton" }));

    // No fetch call because validation fails
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("closes when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<ProjectModal open onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("lets user change section and color before submit", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(<ProjectModal open onOpenChange={() => {}} />);

    await user.type(
      screen.getByPlaceholderText("namePlaceholder"),
      "Work Thing"
    );

    // Toggle to "work"
    await user.click(screen.getByRole("radio", { name: /sections\.work/ }));
    // Switch color to "red"
    await user.click(screen.getByRole("button", { name: "colors.red" }));

    await user.click(screen.getByRole("button", { name: "createButton" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    expect(body.section).toBe("work");
    expect(body.color).toBe("red");
  });

  it("has no accessibility violations when open", async () => {
    const { container } = render(
      <ProjectModal open onOpenChange={() => {}} />
    );
    // Radix Dialog renders into a portal — pass the whole document body section.
    // Disable color-contrast since it relies on computed styles not present in jsdom.
    expect(
      await axe(container, {
        rules: {
          "color-contrast": { enabled: false },
        },
      })
    ).toHaveNoViolations();
  });
});
