export interface ModelOption {
  id: string;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
];

export const DEFAULT_MODEL_ID = "gpt-5.4-mini";

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}
