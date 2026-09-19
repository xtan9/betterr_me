import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById } from "@/lib/ai/models";

describe("models", () => {
  it("exposes only the gateway-supported GPT-5.5 model", () => {
    expect(AVAILABLE_MODELS).toEqual([
      { id: "gpt-5.5", label: "GPT-5.5" },
    ]);
  });

  it("each model has id and label", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it("uses GPT-5.5 by default", () => {
    expect(DEFAULT_MODEL_ID).toBe("gpt-5.5");
  });

  it("default model exists in the available models list", () => {
    const found = AVAILABLE_MODELS.find((m) => m.id === DEFAULT_MODEL_ID);
    expect(found).toBeDefined();
  });

  it("getModelById returns the correct model", () => {
    const model = getModelById("gpt-5.5");
    expect(model).toBeDefined();
    expect(model!.label).toBe("GPT-5.5");
  });

  it("getModelById returns undefined for unknown model", () => {
    expect(getModelById("unknown-model")).toBeUndefined();
  });
});
