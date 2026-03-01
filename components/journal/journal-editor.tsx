"use client";

import { useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { JournalToolbar } from "./journal-toolbar";

/**
 * Count words handling both Latin (space-separated) and CJK characters.
 * CJK characters are each counted as one word. Latin words are split on whitespace.
 */
export function countWords(text: string): number {
  if (!text.trim()) return 0;

  // CJK Unified Ideographs + common CJK ranges
  const CJK_RE =
    /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/gu;

  const cjkCount = (text.match(CJK_RE) || []).length;
  const withoutCjk = text.replace(CJK_RE, " ");
  const latinWords = withoutCjk
    .split(/\s+/)
    .filter((w) => w.length > 0);

  return cjkCount + latinWords.length;
}

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
        placeholder: placeholder ?? "",
      }),
    ],
    content: content ?? undefined,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const text = editor.state.doc.textContent;
      onUpdateRef.current(editor.getJSON(), countWords(text));
    },
  });

  if (!editor) return null;

  return (
    <div className="tiptap-journal">
      <JournalToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
