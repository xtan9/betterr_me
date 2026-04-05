import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
}));

vi.mock("lucide-react", () => ({
  Plus: () => <span data-testid="icon-plus">+</span>,
  PanelLeftClose: () => <span data-testid="icon-panel-close">X</span>,
  Trash2: () => <span data-testid="icon-trash">D</span>,
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
  model: "claude-sonnet-4-20250514",
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
      />
    );
    const button = container.querySelector("button");
    expect(button?.className).toContain("bg-accent");
    expect(button?.className).toContain("text-accent-foreground");
  });

  it("does not apply active styling when isActive is false", () => {
    const { container } = render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const button = container.querySelector("button");
    expect(button?.className).not.toContain("bg-accent");
  });

  it("calls onSelect when clicking the conversation", () => {
    const onSelect = vi.fn();
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={onSelect}
        onDelete={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText("My Chat"));
    expect(onSelect).toHaveBeenCalledWith("conv-1");
  });

  it("calls onDelete when clicking delete button", () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    render(
      <ConversationItem
        conversation={defaultConversation}
        isActive={false}
        onSelect={onSelect}
        onDelete={onDelete}
      />
    );
    const deleteBtn = screen.getByLabelText("sidebar.deleteConfirm");
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("conv-1");
    // Should not trigger onSelect
    expect(onSelect).not.toHaveBeenCalled();
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

  it("calls onDeleteConversation when clicking delete button", () => {
    const onDelete = vi.fn();
    render(
      <ConversationSidebar
        {...defaultProps}
        onDeleteConversation={onDelete}
      />
    );
    const deleteButtons = screen.getAllByLabelText("sidebar.deleteConfirm");
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
