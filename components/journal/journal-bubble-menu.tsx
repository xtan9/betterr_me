"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link2,
  Minus,
  ListChecks,
} from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

interface JournalBubbleMenuProps {
  editor: Editor;
}

function Separator() {
  return <div className="w-px h-5 bg-border mx-0.5" />;
}

export function JournalBubbleMenu({ editor }: JournalBubbleMenuProps) {
  const handleLink = () => {
    const url = window.prompt("URL:");
    if (url) {
      editor.chain().focus().toggleLink({ href: url }).run();
    } else if (url === "") {
      editor.chain().focus().unsetLink().run();
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg"
    >
      {/* Text formatting */}
      <Toggle
        size="sm"
        pressed={editor.isActive("bold")}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("italic")}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("strike")}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </Toggle>

      <Separator />

      {/* Headings */}
      <Toggle
        size="sm"
        pressed={editor.isActive("heading", { level: 2 })}
        onPressedChange={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("heading", { level: 3 })}
        onPressedChange={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        <Heading3 className="size-4" />
      </Toggle>

      <Separator />

      {/* Lists */}
      <Toggle
        size="sm"
        pressed={editor.isActive("bulletList")}
        onPressedChange={() =>
          editor.chain().focus().toggleBulletList().run()
        }
      >
        <List className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("orderedList")}
        onPressedChange={() =>
          editor.chain().focus().toggleOrderedList().run()
        }
      >
        <ListOrdered className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("taskList")}
        onPressedChange={() =>
          editor.chain().focus().toggleTaskList().run()
        }
      >
        <ListChecks className="size-4" />
      </Toggle>

      <Separator />

      {/* Block formatting */}
      <Toggle
        size="sm"
        pressed={editor.isActive("blockquote")}
        onPressedChange={() =>
          editor.chain().focus().toggleBlockquote().run()
        }
      >
        <Quote className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("codeBlock")}
        onPressedChange={() =>
          editor.chain().focus().toggleCodeBlock().run()
        }
      >
        <Code2 className="size-4" />
      </Toggle>

      <Separator />

      {/* Link & Horizontal Rule */}
      <Toggle
        size="sm"
        pressed={editor.isActive("link")}
        onPressedChange={handleLink}
      >
        <Link2 className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={false}
        onPressedChange={() =>
          editor.chain().focus().setHorizontalRule().run()
        }
      >
        <Minus className="size-4" />
      </Toggle>
    </BubbleMenu>
  );
}
