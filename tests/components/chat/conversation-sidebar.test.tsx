import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Conversation } from "@/lib/db/types";

// --- Mocks ---

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: React.PropsWithChildren<{
    onClick?: React.MouseEventHandler;
    "aria-label"?: string;
    "data-testid"?: string;
  }>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: React.PropsWithChildren) => (
    <div data-testid="scroll-area">{children}</div>
  ),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    children,
    open,
  }: React.PropsWithChildren<{ open?: boolean }>) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: React.PropsWithChildren) => (
    <div data-testid="sheet-content">{children}</div>
  ),
  SheetHeader: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: React.PropsWithChildren) => (
    <span>{children}</span>
  ),
  SheetDescription: ({ children }: React.PropsWithChildren) => (
    <span>{children}</span>
  ),
}));

vi.mock("lucide-react", () => ({
  Plus: () => <span data-testid="icon-plus">+</span>,
  PanelLeftClose: () => <span data-testid="icon-panel-close">X</span>,
  MoreVertical: () => <span data-testid="icon-more">⋮</span>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild: _asChild, ...props }: React.PropsWithChildren<{ asChild?: boolean }>) => <div {...props}>{children}</div>,
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => <div data-testid="dropdown-content">{children}</div>,
  DropdownMenuItem: ({ children, onClick, ...props }: React.PropsWithChildren<{ onClick?: () => void; className?: string }>) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { ConversationItem } from "@/components/chat/conversation-item";

const makeConversation = (
  id: string,
  title: string | null
): Conversation => ({
  id,
  user_id: "user-1",
  title,
  model: "claude-sonnet-4-6",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
});

describe("ConversationItem", () => {
  const defaultConversation = makeConversation("conv-1", "My Chat");

  it("renders conversation title", () => {
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />
    );
    expect(screen.getByText("My Chat")).toBeInTheDocument();
  });

  it("renders untitled label when title is null", () => {
    const conv = makeConversation("conv-2", null);
    render(
      <ConversationItem
        conversation={conv}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />
    );
    expect(screen.getByText("sidebar.untitled")).toBeInTheDocument();
  });

  it("applies active styling when isActive is true", () => {
    const { container } = render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={true}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />
    );
    const el = container.querySelector("[role='button']");
    expect(el?.className).toContain("bg-accent");
    expect(el?.className).toContain("text-accent-foreground");
  });

  it("does not apply active styling when isActive is false", () => {
    const { container } = render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />
    );
    const el = container.querySelector("[role='button']");
    expect(el?.className).not.toContain("bg-accent");
  });

  it("calls onSelect when clicking the conversation", () => {
    const onSelect = vi.fn();
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={onSelect}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("My Chat"));
    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  it("calls onDelete when clicking delete menu item", () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={vi.fn()}
      />
    );
    const deleteBtn = screen.getByText("sidebar.delete");
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("conv-1");
  });

  it("ConversationItem has onRename prop", () => {
    const onRename = vi.fn();
    render(
      <ConversationItem
        conversation={makeConversation("conv-1", "My Chat")}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={onRename}
      />
    );
    // The rename option should be in the dropdown
    expect(screen.getByText("sidebar.rename")).toBeInTheDocument();
  });

  it("clicking rename shows an input pre-filled with current title", async () => {
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("sidebar.rename"));
    await waitFor(() => {
      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect((input as HTMLInputElement).value).toBe("My Chat");
    });
  });

  it("pressing Enter in rename input calls onRename with conversation id and new title", async () => {
    const onRename = vi.fn();
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByText("sidebar.rename"));
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Renamed Chat" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("conv-1", "Renamed Chat");
  });

  it("pressing Escape in rename input cancels without calling onRename", async () => {
    const onRename = vi.fn();
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onRename={onRename}
      />
    );
    fireEvent.click(screen.getByText("sidebar.rename"));
    await waitFor(() => expect(screen.getByRole("textbox")).toBeInTheDocument());

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Changed Title" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("ConversationSidebar", () => {
  const conversations = [
    makeConversation("conv-1", "First Chat"),
    makeConversation("conv-2", "Second Chat"),
    makeConversation("conv-3", null),
  ];

  const defaultProps = {
    conversations,
    activeConversationId: "conv-1",
    onSelectConversation: vi.fn(),
    onNewChat: vi.fn(),
    onDeleteConversation: vi.fn(),
    onRenameConversation: vi.fn(),
    isOpen: false,
    onToggle: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders conversation items with titles", () => {
    render(<ConversationSidebar {...defaultProps} />);
    expect(screen.getByText("First Chat")).toBeInTheDocument();
    expect(screen.getByText("Second Chat")).toBeInTheDocument();
  });

  it("shows untitled for conversations with null title", () => {
    render(<ConversationSidebar {...defaultProps} />);
    expect(screen.getByText("sidebar.untitled")).toBeInTheDocument();
  });

  it("renders sidebar title", () => {
    render(<ConversationSidebar {...defaultProps} />);
    expect(screen.getByText("sidebar.title")).toBeInTheDocument();
  });

  it("calls onNewChat when clicking new chat button", () => {
    const onNewChat = vi.fn();
    render(<ConversationSidebar {...defaultProps} onNewChat={onNewChat} />);
    const newChatBtn = screen.getByTestId("new-chat-button");
    fireEvent.click(newChatBtn);
    expect(onNewChat).toHaveBeenCalled();
  });

  it("calls onSelectConversation when clicking a conversation", () => {
    const onSelect = vi.fn();
    render(
      <ConversationSidebar
        {...defaultProps}
        onSelectConversation={onSelect}
      />
    );
    fireEvent.click(screen.getByText("Second Chat"));
    expect(onSelect).toHaveBeenCalledWith("conv-2");
  });

  it("calls onDeleteConversation when clicking delete menu item", () => {
    const onDelete = vi.fn();
    render(
      <ConversationSidebar
        {...defaultProps}
        onDeleteConversation={onDelete}
      />
    );
    const deleteButtons = screen.getAllByText("sidebar.delete");
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith("conv-1");
  });

  it("shows mobile sheet when isOpen is true", () => {
    render(<ConversationSidebar {...defaultProps} isOpen={true} />);
    expect(screen.getByTestId("sheet")).toBeInTheDocument();
  });

  it("does not show mobile sheet when isOpen is false", () => {
    render(<ConversationSidebar {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });
});
