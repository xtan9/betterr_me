import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventQuickCreate } from "@/components/calendar/event-quick-create";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("EventQuickCreate", () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    date: "2026-04-01",
    startTime: "10:00",
    endTime: "10:30",
    onMoreOptions: vi.fn(),
    onSaved: vi.fn(),
    anchorPosition: { x: 200, y: 300 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("renders title input when isOpen=true", () => {
    render(<EventQuickCreate {...defaultProps} />);
    const input = screen.getByPlaceholderText("quickCreate.titlePlaceholder");
    expect(input).toBeInTheDocument();
  });

  it("shows pre-filled time display from startTime and endTime props", () => {
    render(<EventQuickCreate {...defaultProps} />);
    // The component displays startTime – endTime (en-dash entity)
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
    expect(screen.getByText(/10:30/)).toBeInTheDocument();
  });

  it("shows More options button", () => {
    render(<EventQuickCreate {...defaultProps} />);
    expect(screen.getByText("quickCreate.moreOptions")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed in the title input", () => {
    render(<EventQuickCreate {...defaultProps} />);
    const input = screen.getByPlaceholderText("quickCreate.titlePlaceholder");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it("calls onMoreOptions with current title value when More options clicked", () => {
    render(<EventQuickCreate {...defaultProps} />);
    const input = screen.getByPlaceholderText("quickCreate.titlePlaceholder");
    fireEvent.change(input, { target: { value: "My Event" } });
    fireEvent.click(screen.getByText("quickCreate.moreOptions"));
    expect(defaultProps.onMoreOptions).toHaveBeenCalledWith("My Event");
  });

  it("submits event via fetch POST on Enter key with correct payload", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<EventQuickCreate {...defaultProps} />);
    const input = screen.getByPlaceholderText("quickCreate.titlePlaceholder");
    fireEvent.change(input, { target: { value: "Team Standup" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Team Standup",
          start_date: "2026-04-01",
          start_time: "10:00:00",
          end_date: "2026-04-01",
          end_time: "10:30:00",
        }),
      });
    });
  });

  it("calls onSaved after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(<EventQuickCreate {...defaultProps} />);
    const input = screen.getByPlaceholderText("quickCreate.titlePlaceholder");
    fireEvent.change(input, { target: { value: "Meeting" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(defaultProps.onSaved).toHaveBeenCalledOnce();
    });
  });

  it("does not render when isOpen=false", () => {
    const { container } = render(
      <EventQuickCreate {...defaultProps} isOpen={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("does not submit when title is empty", async () => {
    render(<EventQuickCreate {...defaultProps} />);
    const input = screen.getByPlaceholderText("quickCreate.titlePlaceholder");
    // Title is empty by default
    fireEvent.keyDown(input, { key: "Enter" });

    // fetch should not be called
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
