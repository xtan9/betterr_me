export interface ModelOption {
  id: string;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
];

export const DEFAULT_MODEL_ID = "gpt-6.1-sol";

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}
