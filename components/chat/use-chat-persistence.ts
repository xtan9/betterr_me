"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { log } from "@/lib/logger";

async function fetchJSON(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function fetchJSONWithRetry(url: string, init: RequestInit) {
  try {
    return await fetchJSON(url, init);
  } catch {
    return fetchJSON(url, init);
  }
}

export function useChatPersistence(
  status: string,
  messages: UIMessage[],
  activeConversationId: string | null,
  setActiveConversationId: (id: string | null) => void,
  selectedModel: string,
  mutateConversations: () => void,
) {
  const prevStatusRef = useRef(status);
  const retrySaveRef = useRef<(() => Promise<void>) | null>(null);
  const [persistenceError, setPersistenceError] = useState<Error | null>(null);

  const retryPersistence = useCallback(() => {
    void retrySaveRef.current?.();
  }, []);

  const clearPersistenceError = useCallback(() => {
    retrySaveRef.current = null;
    setPersistenceError(null);
  }, []);

  useEffect(() => {
    const wasStreaming =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted";
    prevStatusRef.current = status;

    if (wasStreaming && status === "ready" && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role !== "assistant") return;

      const assistantContent = lastMsg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");

      // Skip save if content is empty (can happen if effect fires before parts are finalized)
      if (!assistantContent.trim()) return;

      // Find the user message that triggered this response (second-to-last message)
      const userMsg = messages.length >= 2 ? messages[messages.length - 2] : null;
      const userContent =
        userMsg?.role === "user"
          ? userMsg.parts
              .filter((p): p is { type: "text"; text: string } => p.type === "text")
              .map((p) => p.text)
              .join("")
          : null;

      if (!userMsg || !userContent?.trim()) return;

      const saveMessages = async () => {
        setPersistenceError(null);
        try {
          let convId = activeConversationId;

          // Create conversation if this is the first message (new chat)
          if (!convId) {
            const data = await fetchJSON("/api/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: selectedModel }),
            });
            convId = data.conversation.id;
            setActiveConversationId(convId);
            window.history.replaceState(null, "", `/chat?id=${convId}`);
          }

          await fetchJSONWithRetry(`/api/conversations/${convId}/turns`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              turnId: userMsg.id,
              userMessage: userContent,
              assistantMessage: assistantContent,
              assistantModel: selectedModel,
            }),
          });
          retrySaveRef.current = null;

          // Auto-generate title after first exchange (exactly 2 messages)
          if (messages.length === 2) {
            fetchJSON(`/api/conversations/${convId}/title`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userMessage: userContent,
                assistantMessage: assistantContent,
              }),
            })
              .then(() => mutateConversations())
              .catch((err) => log.error("[chat] Failed to generate title", err));
          }

          // Refresh conversation list to update updated_at ordering
          mutateConversations();
        } catch (err) {
          const failure =
            err instanceof Error
              ? err
              : new Error("Failed to save completed turn");
          log.error("[chat] Failed to save completed turn", failure);
          setPersistenceError(failure);
        }
      };

      retrySaveRef.current = saveMessages;
      void saveMessages();
    }
  }, [status, messages, activeConversationId, mutateConversations, selectedModel, setActiveConversationId]);

  return { persistenceError, retryPersistence, clearPersistenceError };
}
