"use client";

import { useMemo, useCallback, useEffect } from "react";
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

  // Stable transport instance — prevents re-instantiation on every render
  const transport = useMemo(
    () => new TextStreamChatTransport({ api: "/api/chat" }),
    []
  );

  const { messages, sendMessage, setMessages, stop, status, error } = useChat({
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (error) {
      console.error("[chat] Error:", error.message || error);
    }
  }, [error]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  // Find the last user message text for resend on error
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

  const handleRetry = useCallback(() => {
    if (!lastUserMessage) return;
    // Remove the failed assistant response before resending
    setMessages((prev) => {
      const lastIdx = prev.length - 1;
      if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
        return prev.slice(0, lastIdx);
      }
      return prev;
    });
    sendMessage({ text: lastUserMessage });
  }, [lastUserMessage, setMessages, sendMessage]);

  const errorMessage = useMemo(() => {
    if (!error) return "";
    const msg = error.message || "";
    if (msg.includes("Unauthorized") || msg.includes("401")) {
      return t("error.unauthorized");
    }
    if (msg.includes("not configured") || msg.includes("503")) {
      return t("error.unavailable");
    }
    return t("error.generic");
  }, [error, t]);

  const isRetryable = useMemo(() => {
    if (!error) return false;
    const msg = error.message || "";
    // 401 and 503 are not retryable — user needs to re-login or wait for config
    return !msg.includes("Unauthorized") && !msg.includes("401") &&
           !msg.includes("not configured") && !msg.includes("503");
  }, [error]);

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
          <span className="flex-1">{errorMessage}</span>
          {isRetryable && lastUserMessage && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
            >
              {t("error.retry")}
            </Button>
          )}
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
