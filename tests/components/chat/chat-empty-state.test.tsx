import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ChatEmptyState", () => {
  it("renders translated greeting text", () => {
    render(<ChatEmptyState />);
    expect(screen.getByText("emptyState.greeting")).toBeInTheDocument();
  });

  it("has centered layout classes", () => {
    const { container } = render(<ChatEmptyState />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("items-center");
    expect(wrapper.className).toContain("justify-center");
  });
});
