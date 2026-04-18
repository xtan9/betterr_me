"use client";

import {
  useMemo,
  useCallback,
  useEffect,
  useState,
} from "react";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { FileUIPart } from "ai";
import { useTranslations } from "next-intl";
import useSWR from "swr";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatEmptyState } from "@/components/chat/chat-empty-state";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { dbMessageToUIMessage } from "@/lib/chat/message-utils";
import { DEFAULT_MODEL_ID, AVAILABLE_MODELS } from "@/lib/ai/models";
import { getLocalDateString } from "@/lib/utils";
import { log } from "@/lib/logger";
import { useChatPersistence } from "./use-chat-persistence";
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
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID);

  // SWR for conversation list
  const { data: convData, mutate: mutateConversations } = useSWR<{
    conversations: Conversation[];
  }>("/api/conversations", fetcher);
  const conversations = useMemo(
    () => convData?.conversations ?? [],
    [convData]
  );

  const localDate = getLocalDateString();
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { model: selectedModel, date: localDate, timezone: userTimezone } }),
    [selectedModel, localDate, userTimezone]
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

  // Save both user and assistant messages after stream completes (deferred persistence).
  useChatPersistence(status, messages, activeConversationId, setActiveConversationId, selectedModel, mutateConversations);

  useEffect(() => {
    if (error) {
      log.error("[chat] Streaming error", error);
    }
  }, [error]);

  const handleSend = useCallback(
    (text: string, files?: FileUIPart[]) => {
      // Just send to LLM — user message shown optimistically in useChat buffer.
      // Persistence (conversation creation + user + assistant messages) is handled
      // in the stream-complete effect, so a mid-stream refresh leaves no partial data.
      sendMessage({ text, files });
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleModelChange = useCallback(
    async (modelId: string) => {
      const previousModel = selectedModel;
      setSelectedModel(modelId);
      if (activeConversationId) {
        try {
          await fetchJSON(`/api/conversations/${activeConversationId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: modelId }),
          });
        } catch (err) {
          log.error("[chat] Failed to update model", err);
          setSelectedModel(previousModel);
        }
      }
    },
    [activeConversationId, selectedModel]
  );

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
    if (msg.includes("authentication expired")) {
      return t("error.authExpired");
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
      !msg.includes("503") &&
      !msg.includes("authentication expired")
    );
  }, [error]);

  // Conversation switching
  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
      setChatId(id);
      window.history.replaceState(null, "", `/chat?id=${id}`);
      setSidebarOpen(false);
      const conv = conversations.find((c) => c.id === id);
      const storedModel = conv?.model;
      const isValid = storedModel && AVAILABLE_MODELS.some((m) => m.id === storedModel);
      setSelectedModel(isValid ? storedModel : DEFAULT_MODEL_ID);
    },
    [conversations]
  );

  // New chat
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setChatId("new");
    setMessages([]);
    setSelectedModel(DEFAULT_MODEL_ID);
    window.history.replaceState(null, "", "/chat");
    setSidebarOpen(false);
  }, [setMessages]);

  // Rename conversation
  const handleRenameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await fetchJSON(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        mutateConversations();
      } catch (err) {
        log.error("[chat] Failed to rename conversation", err);
      }
    },
    [mutateConversations]
  );

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
        onRenameConversation={handleRenameConversation}
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
          <MessageList messages={messages} status={status} />
        )}

        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-card bg-destructive/10 px-4 py-3 text-destructive text-body">
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
          modelId={selectedModel}
          onModelChange={handleModelChange}
        />
      </div>
    </div>
  );
}
