# Phase 25: i18n & Polish - Research

**Researched:** 2026-02-24
**Domain:** i18n translation completeness, dark mode styling verification
**Confidence:** HIGH

## Summary

Phase 25 is a polish phase that completes two remaining requirements: translating all journal UI strings into zh and zh-TW (I18N-01, I18N-02), and verifying dark mode renders correctly across all journal components. The codebase already has a mature i18n infrastructure using next-intl with three locale files (en.json, zh.json, zh-TW.json) and all journal components already use `useTranslations()` hooks. The i18n key structure is identical across all three locales -- no missing keys exist.

The primary gap is that the `journal.prompts` section (20 keys: title, trigger, 3 category labels, and 15 writing prompts) in zh.json and zh-TW.json contains untranslated English text. Additionally, two hardcoded English strings exist in component code: `"Start writing..."` in the Tiptap placeholder fallback and `"URL:"` in a `window.prompt()` call. For dark mode, all journal components use Tailwind theme tokens (text-foreground, bg-muted, etc.) and the link chips already have explicit `dark:` variants, so the risk is low but verification is still needed.

**Primary recommendation:** Translate the 20 untranslated prompt keys in zh.json and zh-TW.json, fix the 2 hardcoded English strings in component code, then do a visual/automated dark mode audit of all journal components.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| I18N-01 | All journal UI strings translated in en, zh, zh-TW | Key audit shows all 65 journal i18n keys exist in all 3 locales. 20 prompt keys in zh/zh-TW contain English text that must be translated. 2 hardcoded English strings in components must be converted to i18n keys. |
| I18N-02 | Writing prompts available in all three locales | 15 prompt text keys + title + trigger + 3 category labels (20 total) are English in zh.json and zh-TW.json. Need culturally appropriate Chinese translations for all. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-intl | (already installed) | i18n for Next.js App Router | Already used throughout project; provides `useTranslations()` client hook and `getTranslations()` server function |
| next-themes | (already installed) | Class-based dark mode | Already configured with `darkMode: ["class"]` in Tailwind config |
| Tailwind CSS 3 | (already installed) | Utility-first CSS with dark mode support | Already used; provides `dark:` prefix variants |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | (already installed) | Unit testing | Verify i18n key completeness programmatically |
| Playwright | (already installed) | E2E testing | Visual dark mode verification if needed |

### Alternatives Considered
None -- this phase uses only existing project infrastructure.

**Installation:**
No new packages needed.

## Architecture Patterns

### Existing i18n File Structure
```
i18n/
  messages/
    en.json         # English (reference locale)
    zh.json         # Simplified Chinese
    zh-TW.json      # Traditional Chinese
  request.ts        # Locale detection: cookie -> Accept-Language -> default en
```

### Pattern 1: Translation Key Namespacing
**What:** Journal keys live under `journal.*` (main page/components) and `dashboard.journal.*` (widget on dashboard)
**When to use:** Always -- follows existing project convention
**Example:**
```typescript
// Component-level: use namespace prefix
const t = useTranslations("journal");
t("pageTitle"); // -> "Journal" / "日记" / "日記"

// Or root-level with full path
const t = useTranslations();
t("journal.prompts.gratitude01"); // -> prompt text
```

### Pattern 2: Passing i18n Values as Props
**What:** When a lower component doesn't use hooks (e.g., pure editor), the parent passes translated strings as props
**When to use:** When the consuming component can't or shouldn't use `useTranslations()`
**Example:**
```typescript
// Parent passes placeholder; editor uses it
<JournalEditor
  content={entry?.content ?? null}
  onUpdate={handleEditorUpdate}
  placeholder={t("journal.editor.placeholder")} // NEW key needed
/>
```

### Pattern 3: Dark Mode with Tailwind Theme Tokens
**What:** Use semantic token classes (`text-foreground`, `bg-muted`, `border-border`, `text-primary`, etc.) instead of raw colors
**When to use:** Always in non-accent contexts
**Example:**
```typescript
// GOOD: uses theme tokens, auto-adapts to dark mode
<p className="text-sm text-muted-foreground">content</p>

// GOOD: explicit dark: variant for raw colors (link chips pattern)
className="bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200"

// BAD: raw color without dark: variant
className="bg-gray-100 text-gray-800"  // breaks in dark mode
```

### Anti-Patterns to Avoid
- **Hardcoded English strings in components:** Always use `t()` from `useTranslations()`. Never embed user-visible English text directly in JSX or JS.
- **Translating by machine only without cultural review:** Chinese translations for reflective/emotional prompts need nuance -- both zh (mainland) and zh-TW (Taiwan) have distinct phrasing norms.
- **Using `text-white` or `text-black` directly:** These don't adapt to dark mode. Use `text-foreground`, `text-background`, etc.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Missing key detection | Manual JSON diffing | Automated test that compares flattened key sets | Catches regressions in future phases |
| Dark mode color mapping | Custom CSS variables | Tailwind `dark:` prefix or semantic token classes | Already works; consistent with entire codebase |
| Locale detection | Custom middleware | next-intl `getRequestConfig` in `i18n/request.ts` | Already implemented and working |

**Key insight:** The i18n infrastructure is fully built. This phase is purely about filling translation gaps and verifying visual correctness -- no architectural work needed.

## Common Pitfalls

### Pitfall 1: Translating Prompts Too Literally
**What goes wrong:** Writing prompts lose their reflective, conversational tone when translated word-for-word.
**Why it happens:** Machine translation or literal translation doesn't capture cultural nuance in journaling prompts.
**How to avoid:** Translate for meaning and cultural appropriateness. "What made you smile today?" in zh might be "今天有什么让你开心的事吗？" (conversational) rather than "今天什么让你微笑了？" (literal).
**Warning signs:** Prompts feel stiff or unnatural when read aloud in the target language.

### Pitfall 2: zh vs zh-TW Differences Beyond Characters
**What goes wrong:** Using the same text for both zh and zh-TW, just converting simplified to traditional characters.
**Why it happens:** Assuming simplified/traditional is the only difference.
**How to avoid:** zh (mainland China) and zh-TW (Taiwan) have vocabulary differences:
  - zh: "保存" (save) vs zh-TW: "儲存" (save)
  - zh: "信息" (message) vs zh-TW: "訊息" (message)
  - zh: "视频" (video) vs zh-TW: "影片" (video)
  The existing locale files already demonstrate this awareness (e.g., zh uses "保存" while zh-TW uses "儲存").
**Warning signs:** zh-TW translations read like mainland Chinese with traditional characters.

### Pitfall 3: Missing the Hardcoded Strings
**What goes wrong:** Translating locale files but leaving English strings embedded in component code.
**Why it happens:** Developers hardcode fallback text during initial implementation and forget to i18n-ify it later.
**How to avoid:** Systematic grep for English strings in journal component files.
**Warning signs:** Switching locale still shows some English UI text.

### Pitfall 4: window.prompt() is Not Translatable via i18n
**What goes wrong:** `window.prompt("URL:")` in the bubble menu always shows English regardless of locale.
**Why it happens:** Browser's `window.prompt()` takes a raw string, not a translated key.
**How to avoid:** Either accept this as an edge case (the prompt says "URL:" which is universal) or replace `window.prompt` with a custom modal/input that uses `useTranslations()`.
**Warning signs:** Users see "URL:" prompt in English on Chinese locale.

### Pitfall 5: Forgetting to Add All Three Locale Files
**What goes wrong:** Adding a new i18n key to en.json but forgetting zh.json or zh-TW.json (or vice versa).
**Why it happens:** Manual process with three files.
**How to avoid:** Any new key additions should be done to all three files simultaneously. Add a test that validates key parity.
**Warning signs:** next-intl falls back to key path display (e.g., shows "journal.editor.placeholder" as literal text).

## Code Examples

Verified patterns from project codebase:

### Adding a New i18n Key (All Three Locales)
```json
// en.json - journal section
"editor": {
  "placeholder": "Start writing..."
}

// zh.json - journal section
"editor": {
  "placeholder": "开始写作..."
}

// zh-TW.json - journal section
"editor": {
  "placeholder": "開始寫作..."
}
```

### Using Translation in Editor Component
```typescript
// journal-editor.tsx
// Source: Existing project pattern from journal-entry-modal.tsx
interface JournalEditorProps {
  content: Record<string, unknown> | null;
  onUpdate: (json: Record<string, unknown>, wordCount: number) => void;
  placeholder?: string; // Passed from parent which has useTranslations()
}

export function JournalEditor({ content, onUpdate, placeholder }: JournalEditorProps) {
  const editor = useEditor({
    extensions: [
      // ...
      Placeholder.configure({
        placeholder: placeholder ?? "Start writing...", // Fallback should be removed
      }),
    ],
    // ...
  });
}
```

### Testing i18n Key Completeness
```typescript
// Source: Common pattern for i18n validation tests
import en from "@/i18n/messages/en.json";
import zh from "@/i18n/messages/zh.json";
import zhTW from "@/i18n/messages/zh-TW.json";

function flatKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      return flatKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe("i18n key parity", () => {
  it("zh.json has all keys from en.json", () => {
    const enKeys = flatKeys(en);
    const zhKeys = new Set(flatKeys(zh));
    const missing = enKeys.filter((k) => !zhKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("zh-TW.json has all keys from en.json", () => {
    const enKeys = flatKeys(en);
    const zhTWKeys = new Set(flatKeys(zhTW));
    const missing = enKeys.filter((k) => !zhTWKeys.has(k));
    expect(missing).toEqual([]);
  });
});
```

### Existing Dark Mode Pattern in Link Chips
```typescript
// Source: components/journal/journal-link-chips.tsx
const CHIP_STYLES: Record<JournalLinkType, string> = {
  habit: "bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200",
  task: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200",
  project: "bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200",
};
```

## Detailed Gap Analysis

### I18N-01: Missing/Untranslated Strings

**Locale file gaps (keys exist but values are English):**

| File | Section | Keys | Status |
|------|---------|------|--------|
| zh.json | journal.prompts.title | 1 | English text |
| zh.json | journal.prompts.trigger | 1 | English text |
| zh.json | journal.prompts.categories.* | 3 | English text |
| zh.json | journal.prompts.gratitude01-05 | 5 | English text |
| zh.json | journal.prompts.reflection01-05 | 5 | English text |
| zh.json | journal.prompts.goals01-05 | 5 | English text |
| zh-TW.json | (same sections as above) | 20 | English text |

**Total: 20 keys x 2 locales = 40 translations needed**

**Hardcoded strings in component code:**

| File | Line | String | Fix |
|------|------|--------|-----|
| `components/journal/journal-editor.tsx` | 29 | `"Start writing..."` | Add `journal.editor.placeholder` key, pass from parent |
| `components/journal/journal-bubble-menu.tsx` | 31 | `window.prompt("URL:")` | Low priority -- "URL:" is universal; optionally replace with custom input |

### I18N-02: Prompts Translation Scope

15 writing prompts across 3 categories need culturally appropriate translations:

**Gratitude (5 prompts):**
- Focus on positive reflection, thankfulness
- Cultural note: Chinese journaling culture values harmony and relationships

**Reflection (5 prompts):**
- Focus on self-awareness, emotional processing
- Cultural note: More introspective, less direct than English phrasing

**Goals (5 prompts):**
- Focus on future planning, personal growth
- Cultural note: Goal-setting language in Chinese tends to be more modest

### Dark Mode Verification Checklist

All journal components were audited for dark mode compatibility:

| Component | Uses Theme Tokens | Has Hardcoded Colors | Dark Mode Status |
|-----------|-------------------|---------------------|-----------------|
| journal-editor.tsx | Yes (via CSS) | No | OK - Tiptap styles use @apply with theme tokens |
| journal-entry-modal.tsx | Yes | No | OK |
| journal-mood-selector.tsx | Yes (primary/muted) | No | OK |
| journal-save-status.tsx | Yes | No | OK |
| journal-delete-dialog.tsx | Yes | No | OK |
| journal-calendar.tsx | Yes | No | OK |
| journal-timeline.tsx | Yes | No | OK |
| journal-timeline-card.tsx | Yes | No | OK |
| journal-widget.tsx | Yes | No | OK |
| journal-streak-badge.tsx | Mostly | text-orange-500 (intentional accent) | OK - accent color works in both modes |
| journal-on-this-day.tsx | Yes | No | OK |
| journal-on-this-day-full.tsx | Yes | No | OK |
| journal-link-chips.tsx | Yes | Uses explicit dark: variants | OK |
| journal-link-selector.tsx | Yes | Uses explicit dark: variants | OK |
| journal-mood-dot.tsx | N/A | bg-green/emerald/yellow/orange/red (mood indicators) | OK - small dots, same in both modes |
| journal-bubble-menu.tsx | Yes (bg-background, bg-border) | No | OK |
| journal-editor-skeleton.tsx | Yes (bg-muted) | No | OK |
| prompt-browser-sheet.tsx | Yes | No | OK |
| prompt-banner.tsx | Yes (primary/5, primary/10) | No | OK |
| globals.css (tiptap) | Yes (@apply theme tokens) | No | OK |

**Dark mode assessment:** All journal components appear correctly themed. No hardcoded colors that would break in dark mode. Visual verification during implementation is recommended but no code changes anticipated.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual key counting | Automated test for key parity | Best practice | Catches missing keys in CI |
| Copy-paste simplified->traditional | Distinct translations per locale | Project convention | Better UX for Taiwan users |

## Open Questions

1. **window.prompt("URL:") translation**
   - What we know: This is a browser native dialog, not translatable via next-intl
   - What's unclear: Whether to replace with custom input component or accept "URL:" as universal
   - Recommendation: Accept as-is -- "URL:" is a technical term understood across locales. Note it as known limitation. Replacing window.prompt with a custom modal is out of scope for a polish phase.

2. **Quality assurance for Chinese translations**
   - What we know: We can generate translations, but native speaker review is ideal
   - What's unclear: Whether the existing zh/zh-TW translations in other sections were professionally translated or machine-generated
   - Recommendation: Review existing translation patterns in zh.json and zh-TW.json for consistency. The existing translations appear high quality (different vocabulary choices between zh and zh-TW), suggesting they were written with care.

## Sources

### Primary (HIGH confidence)
- Project codebase audit: `i18n/messages/en.json`, `zh.json`, `zh-TW.json` -- direct inspection of all 65 journal keys and 10 dashboard.journal keys
- Project codebase audit: All 20 journal component files inspected for hardcoded strings and dark mode patterns
- `i18n/request.ts` -- locale detection logic
- `app/globals.css` -- Tiptap dark mode styles
- `tailwind.config.ts` -- `darkMode: ["class"]` confirmed

### Secondary (MEDIUM confidence)
- CLAUDE.md project conventions for i18n patterns
- Existing test patterns for i18n mocking (`NextIntlClientProvider` usage)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools already exist in project, no new dependencies
- Architecture: HIGH - i18n patterns well-established, just filling gaps
- Pitfalls: HIGH - specific gaps identified through code audit, not speculation
- Dark mode: HIGH - every component individually audited

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (stable -- locale files and component patterns unlikely to change)
