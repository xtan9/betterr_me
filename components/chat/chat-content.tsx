"use client";

import {
  useMemo,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";

import { useChat } from "@ai-sdk/react";
import { TextStreamChatTransport } from "ai";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { dbMessageToUIMessage } from "@/lib/chat/message-utils";
import { log } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { AlertCircle, PanelLeftOpen } from "lucide-react";
import type { Conversation } from "@/lib/db/types";

interface ChatContentProps {
  conversationId?: string;
}

async function fetchJSON(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const fetcher = (url: string) => fetchJSON(url);

export function ChatContent({ conversationId }: ChatContentProps) {
  const t = useTranslations("chat");

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId ?? null);
  // Separate chatId for useChat — only changes on explicit user actions
  // (switching conversations, new chat), never during stream completion.
  // This prevents useChat from resetting its internal message buffer.
  const [chatId, setChatId] = useState(conversationId ?? "new");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  // SWR for conversation list
  const { data: convData, mutate: mutateConversations } = useSWR<{
    conversations: Conversation[];
  }>("/api/conversations", fetcher);
  const conversations = convData?.conversations ?? [];

  // Stable transport instance
  const transport = useMemo(
    () => new TextStreamChatTransport({ api: "/api/chat" }),
    []
  );

  const { messages, sendMessage, setMessages, stop, status, error } = useChat({
    id: chatId,
    transport,
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Load messages when chatId changes (user switches conversations or chatId
  // is synced after first-message stream completes)
  useEffect(() => {
    if (chatId === "new") {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const loadMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const data = await fetchJSON(
          `/api/conversations/${chatId}/messages`
        );
        if (!cancelled) {
          const uiMessages = (data.messages || []).map(dbMessageToUIMessage);
          setMessages(uiMessages);
        }
      } catch (err) {
        log.error("[chat] Failed to load messages", err);
      } finally {
        if (!cancelled) {
          setIsLoadingMessages(false);
        }
      }
    };
    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [chatId, setMessages]);

  // Save assistant message after stream completes + auto-generate title
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasStreaming =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted";
    prevStatusRef.current = status;

    if (wasStreaming && status === "ready" && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "assistant" && activeConversationId) {
        const textPart = lastMsg.parts.find((p) => p.type === "text");
        const content = textPart?.type === "text" ? textPart.text : "";

        // D-05: Save assistant message after stream completes
        fetchJSON(`/api/conversations/${activeConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content }),
        }).catch((err) =>
          log.error("[chat] Failed to save assistant message", err)
        );

        // D-07/D-08: Auto-generate title after first exchange (2 messages)
        if (messages.length === 2) {
          const userMsg = messages[0];
          const userText = userMsg.parts.find((p) => p.type === "text");
          fetchJSON(`/api/conversations/${activeConversationId}/title`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userMessage:
                userText?.type === "text" ? userText.text : "",
              assistantMessage: content,
            }),
          })
            .then(() => mutateConversations())
            .catch((err) =>
              log.error("[chat] Failed to generate title", err)
            );
        }

        // Don't sync chatId here — useChat's messages are already in its buffer
        // under the current chatId. Syncing would reset the buffer and cause a
        // visible loading flash. chatId syncs naturally when the user switches
        // conversations or starts a new chat.

        // Refresh conversation list to update updated_at ordering
        mutateConversations();
      }
    }
  }, [status, messages, activeConversationId, mutateConversations]);

  useEffect(() => {
    if (error) {
      log.error("[chat] Streaming error", error);
    }
  }, [error]);

  const handleSend = useCallback(
    async (text: string) => {
      let convId = activeConversationId;

      // D-11: Auto-create conversation on first message if none selected
      if (!convId) {
        try {
          const data = await fetchJSON("/api/conversations", { method: "POST" });
          convId = data.conversation.id;
          // Set activeConversationId for sidebar highlighting and persistence.
          // chatId stays as "new" — it only syncs after the stream completes
          // and messages are saved to DB, preventing useChat from resetting mid-stream.
          setActiveConversationId(convId);
          window.history.replaceState(null, "", `/chat?id=${convId}`);
          mutateConversations();
        } catch (err) {
          log.error("[chat] Failed to create conversation", err);
          return;
        }
      }

      // D-04: Save user message to DB BEFORE sending to LLM
      try {
        await fetchJSON(`/api/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: text }),
        });
      } catch (err) {
        log.error("[chat] Failed to save user message", err);
      }

      // Send to LLM
      sendMessage({ text });
    },
    [activeConversationId, sendMessage, mutateConversations]
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
    return (
      !msg.includes("Unauthorized") &&
      !msg.includes("401") &&
      !msg.includes("not configured") &&
      !msg.includes("503")
    );
  }, [error]);

  // Conversation switching
  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setChatId(id);
    window.history.replaceState(null, "", `/chat?id=${id}`);
    setSidebarOpen(false);
  }, []);

  // New chat
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setChatId("new");
    setMessages([]);
    window.history.replaceState(null, "", "/chat");
    setSidebarOpen(false);
  }, [setMessages]);

  // Delete conversation
  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetchJSON(`/api/conversations/${id}`, { method: "DELETE" });
        mutateConversations();
        if (id === activeConversationId) {
          setActiveConversationId(null);
          setChatId("new");
          setMessages([]);
          window.history.replaceState(null, "", "/chat");
        }
      } catch (err) {
        log.error("[chat] Failed to delete conversation", err);
      }
    },
    [activeConversationId, mutateConversations, setMessages]
  );

  return (
    <div className="flex h-[calc(100vh-var(--header-height,56px))]">
      {/* Sidebar toggle button for mobile */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 left-2 z-10 md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label={t("sidebar.title")}
      >
        <PanelLeftOpen className="h-5 w-5" />
      </Button>

      <ConversationSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {isLoadingMessages ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-muted-foreground">{t("loading")}</span>
          </div>
        ) : messages.length === 0 ? (
          <ChatEmptyState />
        ) : (
          <MessageList messages={messages} />
        )}

        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            {isRetryable && lastUserMessage && (
              <Button variant="outline" size="sm" onClick={handleRetry}>
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
    </div>
  );
}
