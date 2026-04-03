import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "@/components/chat/markdown-renderer";

describe("MarkdownRenderer", () => {
  it("renders bold text as <strong> element", () => {
    render(<MarkdownRenderer content="This is **bold** text" />);
    const strong = screen.getByText("bold");
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders bullet list as <ul><li> elements", () => {
    render(<MarkdownRenderer content={"- item one\n- item two"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const list = items[0].closest("ul");
    expect(list).toBeInTheDocument();
  });

  it("renders numbered list as <ol><li> elements", () => {
    render(<MarkdownRenderer content={"1. first\n2. second"} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const list = items[0].closest("ol");
    expect(list).toBeInTheDocument();
  });

  it('renders fenced code block with "font-mono" class', () => {
    render(<MarkdownRenderer content={'```js\nconsole.log("hi")\n```'} />);
    const codeEl = screen.getByText('console.log("hi")');
    expect(codeEl).toHaveClass("font-mono");
  });

  it("renders inline code with bg-muted class", () => {
    render(<MarkdownRenderer content="Use `inline code` here" />);
    const codeEl = screen.getByText("inline code");
    expect(codeEl.tagName).toBe("CODE");
    expect(codeEl.className).toContain("bg-muted");
  });

  it("renders blockquote with border-l-2 class", () => {
    render(<MarkdownRenderer content="> A quote" />);
    const blockquote = screen.getByText("A quote").closest("blockquote");
    expect(blockquote).toBeInTheDocument();
    expect(blockquote).toHaveClass("border-l-2");
  });

  it('renders links with target="_blank" and rel="noopener noreferrer"', () => {
    render(<MarkdownRenderer content="[Link](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Link" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders GFM tables with <table> element", () => {
    const table = `| Name | Age |
| --- | --- |
| Alice | 30 |`;
    render(<MarkdownRenderer content={table} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("sanitizes javascript: URLs in links", () => {
    const { container } = render(
      <MarkdownRenderer content='[Click](javascript:alert("xss"))' />
    );
    const links = container.querySelectorAll("a");
    for (const link of links) {
      const href = link.getAttribute("href");
      // href should be null/undefined (sanitized) — never contain javascript:
      expect(href === null || href === undefined || !href.includes("javascript:")).toBe(true);
    }
  });

  it("allows https: URLs in links", () => {
    render(<MarkdownRenderer content="[Safe](https://example.com)" />);
    const link = screen.getByRole("link", { name: "Safe" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("renders empty string without crashing", () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container).toBeInTheDocument();
  });
});
