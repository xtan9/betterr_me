export interface ModelOption {
  id: string;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "gpt-5.5", label: "GPT-5.5" },
];

export const DEFAULT_MODEL_ID = "gpt-5.5";

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}
