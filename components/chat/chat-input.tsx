"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Send, CircleStop, Paperclip, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ModelSelector } from "@/components/chat/model-selector";
import type { FileUIPart } from "ai";

interface ChatInputProps {
  onSend: (text: string, files?: FileUIPart[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  modelId: string;
  onModelChange: (modelId: string) => void;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_IMAGES = 20;

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled,
  modelId,
  onModelChange,
}: ChatInputProps) {
  const t = useTranslations("chat");
  const [input, setInput] = useState("");
  const [images, setImages] = useState<FileUIPart[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const dragCountRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [input, adjustHeight]);

  const processFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    setFileError(null);
    for (const file of files) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setFileError(t("input.invalidType"));
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError(t("input.fileTooLarge"));
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImages((prev) => {
          if (prev.length >= MAX_IMAGES) return prev;
          return [
            ...prev,
            {
              type: "file" as const,
              filename: file.name,
              mediaType: file.type as FileUIPart["mediaType"],
              url: dataUrl,
            },
          ];
        });
      };
      reader.readAsDataURL(file);
    }
  }, [t]);

  // Auto-clear file error after 3 seconds
  useEffect(() => {
    if (!fileError) return;
    const timer = setTimeout(() => setFileError(null), 3000);
    return () => clearTimeout(timer);
  }, [fileError]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if ((!trimmed && images.length === 0) || isStreaming) return;
    onSend(trimmed, images.length > 0 ? images : undefined);
    setInput("");
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, images, isStreaming, onSend]);

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

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    },
    [processFiles]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCountRef.current = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files) processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        processFiles(e.target.files);
        // Reset input so the same file can be selected again
        e.target.value = "";
      }
    },
    [processFiles]
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return (
    <div
      className="border-t border-border bg-background px-4 pb-4 pt-2"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="mb-2 flex items-center justify-center rounded-card border-2 border-dashed border-primary/50 bg-primary/5 py-6 text-sm text-muted-foreground">
          {t("input.dropZone")}
        </div>
      )}

      {fileError && (
        <p className="mb-2 text-xs text-destructive">{fileError}</p>
      )}

      {images.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((img, index) => (
            <div key={index} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.filename ?? `Image ${index + 1}`}
                className="h-[60px] w-[60px] rounded-card object-cover"
              />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-pill bg-foreground text-background shadow-sm hover:opacity-80"
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label={t("input.attach")}
          className="shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t("input.placeholder")}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none min-h-[40px] max-h-[150px] overflow-y-auto rounded-control border border-input bg-background px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            disabled={(!input.trim() && images.length === 0) || disabled}
            aria-label={t("input.send")}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="mt-1">
        <ModelSelector
          modelId={modelId}
          onModelChange={onModelChange}
          disabled={isStreaming}
        />
      </div>
    </div>
  );
}
