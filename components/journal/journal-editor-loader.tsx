"use client";

import dynamic from "next/dynamic";
import { JournalEditorSkeleton } from "@/components/journal/journal-editor-skeleton";

const JournalEditor = dynamic(
  () =>
    import("@/components/journal/journal-editor").then(
      (m) => m.JournalEditor
    ),
  { ssr: false, loading: () => <JournalEditorSkeleton /> }
);

interface JournalEditorLoaderProps {
  content: Record<string, unknown> | null;
  onUpdate: (json: Record<string, unknown>, wordCount: number) => void;
}

export function JournalEditorLoader({
  content,
  onUpdate,
}: JournalEditorLoaderProps) {
  return <JournalEditor content={content} onUpdate={onUpdate} />;
}
