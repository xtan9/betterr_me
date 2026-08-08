export interface ModelOption {
  id: string;
  label: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "gpt-5.3-codex-spark", label: "Codex 5.3 Spark" },
];

export const DEFAULT_MODEL_ID = "gpt-5.3-codex-spark";

export function getModelById(id: string): ModelOption | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === id);
}
