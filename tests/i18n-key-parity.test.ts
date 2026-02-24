import { describe, it, expect } from "vitest";
import en from "@/i18n/messages/en.json";
import zh from "@/i18n/messages/zh.json";
import zhTW from "@/i18n/messages/zh-TW.json";

/**
 * Recursively flatten a nested object into dot-notation keys.
 * e.g. { a: { b: "x" } } => ["a.b"]
 */
function flatKeys(
  obj: Record<string, unknown>,
  prefix = ""
): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flatKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

/**
 * Get a nested value from an object by dot-notation path.
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

describe("i18n key parity", () => {
  const enKeys = flatKeys(en as Record<string, unknown>);
  const zhKeys = flatKeys(zh as Record<string, unknown>);
  const zhTWKeys = flatKeys(zhTW as Record<string, unknown>);

  it("zh.json has all keys from en.json", () => {
    const missing = enKeys.filter((k) => !zhKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("zh-TW.json has all keys from en.json", () => {
    const missing = enKeys.filter((k) => !zhTWKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("en.json has all keys from zh.json", () => {
    const missing = zhKeys.filter((k) => !enKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("en.json has all keys from zh-TW.json", () => {
    const missing = zhTWKeys.filter((k) => !enKeys.includes(k));
    expect(missing).toEqual([]);
  });

  it("journal.prompts keys in zh.json are not English", () => {
    const promptKeys = enKeys.filter((k) => k.startsWith("journal.prompts."));
    const untranslated = promptKeys.filter((k) => {
      const enVal = getByPath(en as Record<string, unknown>, k);
      const zhVal = getByPath(zh as Record<string, unknown>, k);
      return enVal === zhVal;
    });
    expect(untranslated).toEqual([]);
  });

  it("journal.prompts keys in zh-TW.json are not English", () => {
    const promptKeys = enKeys.filter((k) => k.startsWith("journal.prompts."));
    const untranslated = promptKeys.filter((k) => {
      const enVal = getByPath(en as Record<string, unknown>, k);
      const zhTWVal = getByPath(zhTW as Record<string, unknown>, k);
      return enVal === zhTWVal;
    });
    expect(untranslated).toEqual([]);
  });
});
