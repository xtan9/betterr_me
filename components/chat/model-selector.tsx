"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AVAILABLE_MODELS } from "@/lib/ai/models";

interface ModelSelectorProps {
  modelId: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  modelId,
  onModelChange,
  disabled,
}: ModelSelectorProps) {
  return (
    <Select value={modelId} onValueChange={onModelChange} disabled={disabled}>
      <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-2 text-caption text-muted-foreground hover:text-foreground focus:ring-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id}>
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
