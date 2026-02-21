import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditScopeDialog } from "@/components/tasks/edit-scope-dialog";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        editTitle: "Edit recurring task",
        editDescription:
          "This is a recurring task. How would you like to apply the changes?",
        deleteTitle: "Delete recurring task",
        deleteDescription:
          "This is a recurring task. How would you like to delete it?",
        thisOnly: "This task only",
        thisAndFollowing: "This and following tasks",
        allInstances: "All tasks in the series",
        cancel: "Cancel",
        confirmEdit: "Save changes",
        confirmDelete: "Delete",
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

describe("EditScopeDialog", () => {
  const mockOnConfirm = vi.fn();
  const mockOnOpenChange = vi.fn();
  const user = userEvent.setup();

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    onConfirm: mockOnConfirm,
    action: "edit" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders edit title and description when action=edit", () => {
    render(<EditScopeDialog {...defaultProps} />);

    expect(screen.getByText("Edit recurring task")).toBeInTheDocument();
    expect(
      screen.getByText(/how would you like to apply the changes/i),
    ).toBeInTheDocument();
  });

  it("renders delete title and description when action=delete", () => {
    render(<EditScopeDialog {...defaultProps} action="delete" />);

    expect(screen.getByText("Delete recurring task")).toBeInTheDocument();
    expect(
      screen.getByText(/how would you like to delete it/i),
    ).toBeInTheDocument();
  });

  it("renders all three scope options", () => {
    render(<EditScopeDialog {...defaultProps} />);

    expect(screen.getByText("This task only")).toBeInTheDocument();
    expect(screen.getByText("This and following tasks")).toBeInTheDocument();
    expect(screen.getByText("All tasks in the series")).toBeInTheDocument();
  });

  it("calls onConfirm with 'this' scope by default", async () => {
    render(<EditScopeDialog {...defaultProps} />);

    await user.click(screen.getByText("Save changes"));

    expect(mockOnConfirm).toHaveBeenCalledWith("this");
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onConfirm with selected scope", async () => {
    render(<EditScopeDialog {...defaultProps} />);

    // Click on "All tasks in the series" radio option
    await user.click(screen.getByLabelText("All tasks in the series"));
    await user.click(screen.getByText("Save changes"));

    expect(mockOnConfirm).toHaveBeenCalledWith("all");
  });

  it("closes dialog on cancel", async () => {
    render(<EditScopeDialog {...defaultProps} />);

    await user.click(screen.getByText("Cancel"));

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    expect(mockOnConfirm).not.toHaveBeenCalled();
  });

  it("shows destructive button style for delete action", () => {
    render(<EditScopeDialog {...defaultProps} action="delete" />);

    const deleteButton = screen.getByText("Delete");
    expect(deleteButton).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(<EditScopeDialog {...defaultProps} open={false} />);

    expect(screen.queryByText("Edit recurring task")).not.toBeInTheDocument();
  });
});
