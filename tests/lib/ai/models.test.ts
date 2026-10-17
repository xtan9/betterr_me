import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById } from "@/lib/ai/models";

describe("models", () => {
  it("exposes only the gateway-supported GPT-6.1 Sol model", () => {
    expect(AVAILABLE_MODELS).toEqual([
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
    ]);
  });

  it("each model has id and label", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it("uses GPT-6.1 Sol by default", () => {
    expect(DEFAULT_MODEL_ID).toBe("gpt-6.1-sol");
  });

  it("default model exists in the available models list", () => {
    const found = AVAILABLE_MODELS.find((m) => m.id === DEFAULT_MODEL_ID);
    expect(found).toBeDefined();
  });

  it("getModelById returns the correct model", () => {
    const model = getModelById("gpt-6.1-sol");
    expect(model).toBeDefined();
    expect(model!.label).toBe("GPT-6.1 Sol");
  });

  it("getModelById returns undefined for unknown model", () => {
    expect(getModelById("unknown-model")).toBeUndefined();
  });
});
