"use client";

import { useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { JournalBubbleMenu } from "./journal-bubble-menu";

interface JournalEditorProps {
  content: Record<string, unknown> | null;
  onUpdate: (json: Record<string, unknown>, wordCount: number) => void;
  placeholder?: string;
}

export function JournalEditor({ content, onUpdate, placeholder }: JournalEditorProps) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      Placeholder.configure({
        placeholder: placeholder ?? "Start writing...",
      }),
    ],
    content: content ?? undefined,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdateRef.current(
        editor.getJSON(),
        editor.storage.characterCount.words()
      );
    },
  });

  if (!editor) return null;

  return (
    <div className="tiptap-journal">
      <JournalBubbleMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
