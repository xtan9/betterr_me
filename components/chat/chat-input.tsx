"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, CircleStop } from "lucide-react";
import { useTranslations } from "next-intl";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === "Enter" &&
        !e.shiftKey &&
        // Guard against submitting during CJK IME composition (nativeEvent check for cross-browser compat)
        !e.nativeEvent.isComposing &&
        !(e as unknown as { isComposing?: boolean }).isComposing
      ) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === "Escape" && isStreaming) {
        e.preventDefault();
        onStop();
      }
    },
    [handleSend, isStreaming, onStop]
  );

  return (
    <div className="flex items-end gap-2 p-4 border-t border-border bg-background">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("input.placeholder")}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none min-h-[40px] max-h-[150px] overflow-y-auto rounded-xl border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      {isStreaming ? (
        <Button
          variant="default"
          size="icon"
          onClick={onStop}
          aria-label={t("input.stop")}
        >
          <CircleStop className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="default"
          size="icon"
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          aria-label={t("input.send")}
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
