import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ProjectColorPicker } from "@/components/projects/project-color-picker";
import { PROJECT_COLORS } from "@/lib/projects/colors";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

describe("ProjectColorPicker", () => {
  it("renders one button per supported color", () => {
    render(<ProjectColorPicker value="blue" onChange={() => {}} />);
    // Each color renders a button with aria-label `colors.<key>`
    for (const color of PROJECT_COLORS) {
      expect(
        screen.getByRole("button", { name: `colors.${color.key}` })
      ).toBeInTheDocument();
    }
  });

  it("applies selected ring to the currently selected color", () => {
    render(<ProjectColorPicker value="red" onChange={() => {}} />);
    const red = screen.getByRole("button", { name: "colors.red" });
    const blue = screen.getByRole("button", { name: "colors.blue" });
    expect(red.className).toContain("ring-2");
    expect(blue.className).not.toContain("ring-2");
  });

  it("calls onChange with the exact color key when a swatch is clicked", async () => {
    const onChange = vi.fn();
    render(<ProjectColorPicker value="blue" onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "colors.purple" })
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("purple");
  });

  it("uses inline background color styling per swatch", () => {
    render(<ProjectColorPicker value="blue" onChange={() => {}} />);
    const blue = screen.getByRole("button", { name: "colors.blue" });
    // jsdom serializes hsl() to rgb() — just assert backgroundColor is set non-empty.
    expect((blue as HTMLElement).style.backgroundColor).not.toBe("");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <ProjectColorPicker value="blue" onChange={() => {}} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
