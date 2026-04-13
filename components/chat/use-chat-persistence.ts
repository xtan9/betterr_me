"use client";

import { useEffect, useRef } from "react";
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

export function useChatPersistence(
  status: string,
  messages: UIMessage[],
  activeConversationId: string | null,
  setActiveConversationId: (id: string | null) => void,
  selectedModel: string,
  mutateConversations: () => void,
) {
  const prevStatusRef = useRef(status);

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

      const saveMessages = async () => {
        let convId = activeConversationId;

        // Create conversation if this is the first message (new chat)
        if (!convId) {
          try {
            const data = await fetchJSON("/api/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: selectedModel }),
            });
            convId = data.conversation.id;
            setActiveConversationId(convId);
            window.history.replaceState(null, "", `/chat?id=${convId}`);
          } catch (err) {
            log.error("[chat] Failed to create conversation", err);
            return;
          }
        }

        // Save user message — abort the whole persistence if this fails
        if (userContent) {
          try {
            await fetchJSON(`/api/conversations/${convId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "user", content: userContent }),
            });
          } catch (err) {
            log.error("[chat] Failed to save user message", err);
            return;
          }
        }

        // Save assistant message
        try {
          await fetchJSON(`/api/conversations/${convId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "assistant", content: assistantContent }),
          });
        } catch (err) {
          log.error("[chat] Failed to save assistant message", err);
        }

        // Auto-generate title after first exchange (exactly 2 messages)
        if (messages.length === 2 && userContent) {
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
      };

      saveMessages().catch((err) =>
        log.error("[chat] Unexpected error in saveMessages", err)
      );
    }
  }, [status, messages, activeConversationId, mutateConversations, selectedModel, setActiveConversationId]);
}
