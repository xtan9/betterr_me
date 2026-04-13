import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { toast } from "sonner";
import { ProjectDeleteDialog } from "@/components/projects/project-delete-dialog";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ProjectDeleteDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders title and description with the project name when open", () => {
    render(
      <ProjectDeleteDialog
        open
        onOpenChange={() => {}}
        projectName="My Project"
        projectId="p-1"
      />
    );

    expect(screen.getByText("deleteTitle")).toBeInTheDocument();
    expect(
      screen.getByText(`deleteDescription:${JSON.stringify({ name: "My Project" })}`)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "confirmDelete" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "cancel" })
    ).toBeInTheDocument();
  });

  it("does not render content when closed", () => {
    render(
      <ProjectDeleteDialog
        open={false}
        onOpenChange={() => {}}
        projectName="Hidden"
        projectId="p-1"
      />
    );
    expect(screen.queryByText("deleteTitle")).not.toBeInTheDocument();
  });

  it("calls DELETE on the correct endpoint and fires onSuccess + closes on confirm", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onSuccess = vi.fn();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    render(
      <ProjectDeleteDialog
        open
        onOpenChange={onOpenChange}
        projectName="My Project"
        projectId="p-42"
        onSuccess={onSuccess}
      />
    );

    await user.click(screen.getByRole("button", { name: "confirmDelete" }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/projects/p-42", {
        method: "DELETE",
      });
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("deleteSuccess");
      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("shows error toast with server message when delete fails", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Project has tasks" }),
    });

    render(
      <ProjectDeleteDialog
        open
        onOpenChange={() => {}}
        projectName="My Project"
        projectId="p-1"
      />
    );

    await user.click(screen.getByRole("button", { name: "confirmDelete" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Project has tasks");
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("handles fetch rejection with generic error", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );

    render(
      <ProjectDeleteDialog
        open
        onOpenChange={() => {}}
        projectName="P"
        projectId="p-1"
      />
    );

    await user.click(screen.getByRole("button", { name: "confirmDelete" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("network down");
    });
  });

  it("closes via Cancel button (onOpenChange called with false)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <ProjectDeleteDialog
        open
        onOpenChange={onOpenChange}
        projectName="My Project"
        projectId="p-1"
      />
    );

    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("has no accessibility violations when open", async () => {
    const { container } = render(
      <ProjectDeleteDialog
        open
        onOpenChange={() => {}}
        projectName="A11y Project"
        projectId="p-1"
      />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
