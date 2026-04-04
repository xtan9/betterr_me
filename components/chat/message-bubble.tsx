"use client";

import type { UIMessage } from "ai";
import { MarkdownRenderer } from "./markdown-renderer";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isStreaming =
    message.role === "assistant" &&
    message.parts.some(
      (part) => part.type === "text" && part.state === "streaming"
    );

  return (
    <div
      className={cn(
        "max-w-[80%] rounded-2xl px-4 py-3",
        isUser
          ? "ml-auto bg-primary text-primary-foreground"
          : "mr-auto bg-muted text-foreground"
      )}
    >
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          if (isUser) {
            return (
              <p key={i} className="whitespace-pre-wrap">
                {part.text}
              </p>
            );
          }
          return <MarkdownRenderer key={i} content={part.text} />;
        }
        return null;
      })}
      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-0.5 bg-foreground animate-blink-cursor" />
      )}
    </div>
  );
}
