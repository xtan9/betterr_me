import { describe, it, expect } from "vitest";
import { countWords } from "@/components/journal/journal-editor";

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });

  it("counts English words", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("one two three four")).toBe(4);
  });

  it("counts Chinese characters as individual words", () => {
    expect(countWords("你好")).toBe(2);
    expect(countWords("今天天气很好")).toBe(6);
  });

  it("counts mixed English and Chinese", () => {
    // "Hello 世界" = 1 English word + 2 CJK characters = 3
    expect(countWords("Hello 世界")).toBe(3);
  });

  it("handles Japanese hiragana and katakana", () => {
    // Each kana character is counted individually
    expect(countWords("こんにちは")).toBe(5);
    expect(countWords("カタカナ")).toBe(4);
  });

  it("handles mixed content with punctuation", () => {
    expect(countWords("Hello, world!")).toBe(2);
    expect(countWords("one. two. three.")).toBe(3);
  });

  it("handles Traditional Chinese", () => {
    expect(countWords("繁體中文")).toBe(4);
  });
});
