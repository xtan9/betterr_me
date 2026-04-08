import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelSelector } from "@/components/chat/model-selector";
import { DEFAULT_MODEL_ID } from "@/lib/ai/models";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("ModelSelector", () => {
  it("renders a combobox trigger", () => {
    render(
      <ModelSelector modelId={DEFAULT_MODEL_ID} onModelChange={vi.fn()} />
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is disabled when disabled prop is true", () => {
    render(
      <ModelSelector
        modelId={DEFAULT_MODEL_ID}
        onModelChange={vi.fn()}
        disabled
      />
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDisabled();
  });
});
