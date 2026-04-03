"use client";

import { useMemo, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export function ChatContent() {
  const t = useTranslations("chat");

  // Stable transport instance — prevents re-instantiation on every render (Pitfall 2)
  const transport = useMemo(
    () => new TextStreamChatTransport({ api: "/api/chat" }),
    []
  );

  const { messages, sendMessage, stop, status, error } = useChat({
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  // Find the last user message text for retry
  const lastUserMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        const textPart = messages[i].parts.find((p) => p.type === "text");
        if (textPart && textPart.type === "text") {
          return textPart.text;
        }
      }
    }
    return "";
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,56px))]">
      {messages.length === 0 ? (
        <ChatEmptyState />
      ) : (
        <MessageList messages={messages} />
      )}

      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t("error.generic")}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => sendMessage({ text: lastUserMessage })}
          >
            {t("error.retry")}
          </Button>
        </div>
      )}

      <ChatInput
        onSend={handleSend}
        onStop={handleStop}
        isStreaming={isStreaming}
      />
    </div>
  );
}
