# Phase 22: Writing Prompts - Research

**Researched:** 2026-02-23
**Domain:** Journal writing prompts UI + data model integration
**Confidence:** HIGH

## Summary

Phase 22 adds optional writing prompts to the existing journal entry system. The infrastructure is already largely in place: the `journal_entries` table has a `prompt_key TEXT` column, the Zod validation schema accepts `prompt_key` as `z.string().max(100).nullable().optional()`, and the autosave hook (`scheduleSave`) passes arbitrary data to the API including `prompt_key`. The main work is (1) defining a prompt library data structure, (2) building a prompt browsing UI (Sheet sidebar with category Tabs), (3) integrating prompt selection into the journal entry modal, and (4) adding Tiptap Placeholder extension for gentle empty-editor hints.

No new npm packages are needed -- `Placeholder` is already available via the installed `@tiptap/extensions` package (the same package that provides `CharacterCount`). The UI components needed (Sheet, Tabs) are already in the project's shadcn/ui library.

**Primary recommendation:** Define prompts as a hardcoded TypeScript constant keyed by prompt ID, with i18n keys for text. Build a `PromptBrowserSheet` component using the existing Sheet + Tabs UI primitives. Wire prompt selection into `JournalEntryModal` state and pass `prompt_key` through the existing autosave flow.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sidebar panel for browsing prompts (appears to the side on desktop, full-screen on mobile)
- Categories displayed as horizontal tabs at the top of the sidebar
- Category tabs only -- no search/filter (library is small enough to scan)
- Sidebar closes after prompt selection (exact select-then-close interaction at Claude's discretion)
- 5-8 prompts per category -- curated and concise, minimal decision fatigue
- Mix of tones: some warm/gentle ("What made you smile today?"), some direct/thought-provoking ("What's one thing you'd change about today?")
- All prompts need i18n support across en, zh, zh-TW (Phase 25 handles full translation, but structure must support it)
- Prompt sidebar triggered from the editor area (exact trigger location at Claude's discretion -- toolbar icon or standalone button)
- Prompt key saved with the journal entry (success criteria requires this)
- Free-form is the default -- prompts are an optional enhancement, not a gate
- Gentle placeholder text in empty editor (e.g., "What's on your mind?" or "Start writing...")

### Claude's Discretion
- Category selection: which categories beyond gratitude/reflection/goals (if any)
- Prompt storage: hardcoded in code vs database-seeded (pick what fits codebase best)
- Prompt placement: above editor as card/banner vs as placeholder text vs other
- Dismissal behavior: whether prompt can be changed/dismissed after writing starts
- Selection interaction: tap-to-select vs tap-to-preview-then-confirm
- First-use experience: whether to show onboarding hint or keep it self-explanatory
- Edit view: whether to show original prompt when re-opening an entry
- Trigger UI: lightbulb icon, "Need inspiration?" link, or other pattern

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRMT-01 | User can choose from a library of writing prompts (gratitude, reflection, goals categories) | Prompt data structure with category grouping, Sheet sidebar with Tabs for category browsing, prompt selection callback, prompt_key saved via existing autosave flow |
| PRMT-02 | User can skip prompts and write free-form | Free-form is the default state (no prompt selected on open), Tiptap Placeholder extension provides gentle hint text, prompt sidebar is entirely opt-in |
</phase_requirements>

## Standard Stack

### Core (ALREADY INSTALLED -- no new packages)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tiptap/extensions` | ^3.20.0 | `Placeholder` extension for empty editor hints | Already installed; same package provides `CharacterCount` used in journal-editor.tsx |
| shadcn/ui `Sheet` | N/A | Prompt browsing sidebar panel | Already in `components/ui/sheet.tsx`; right-side slide-in on desktop, full-screen on mobile |
| shadcn/ui `Tabs` | N/A | Category tab navigation in sidebar | Already in `components/ui/tabs.tsx`; used in tasks and habits pages |

### Supporting (ALREADY INSTALLED)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next-intl` | existing | i18n for prompt text and UI labels | All prompt display text must go through `useTranslations()` |
| `lucide-react` | existing | Icon for prompt trigger button | Lightbulb or Sparkles icon for the "get inspired" trigger |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hardcoded prompts in TS | Supabase `writing_prompts` table | DB adds migration overhead, admin UI complexity, and network latency for a small static dataset (~20 prompts). Hardcoded is simpler and fully cacheable. The codebase already uses hardcoded data for similar small datasets (mood emojis, default categories). |
| Sheet (sidebar panel) | Dialog/Modal or Popover | Sheet matches the user's decision for sidebar browsing. Dialog would stack awkwardly on top of the existing journal entry modal. Popover is too small for scanning 5-8 prompts per category. |
| Single tap-to-select | Tap-to-preview-then-confirm | Preview adds friction for a low-stakes action. User can always change/dismiss the prompt. Single tap with immediate selection is faster. |

**Installation:**
```bash
# No installation needed -- all packages already present
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── data/
│   └── writing-prompts.ts     # Prompt definitions (categories + prompt keys)
components/journal/
├── prompt-browser-sheet.tsx    # Sheet sidebar with Tabs + prompt list
├── prompt-card.tsx             # Individual prompt display card
├── prompt-banner.tsx           # Selected prompt display above editor
├── journal-entry-modal.tsx     # Modified: add prompt state + trigger button
├── journal-editor.tsx          # Modified: add Placeholder extension
i18n/messages/
├── en.json                     # Add journal.prompts namespace
├── zh.json                     # Add journal.prompts namespace
├── zh-TW.json                 # Add journal.prompts namespace
```

### Pattern 1: Prompt Data Structure (Hardcoded TypeScript Constant)
**What:** Define all prompts as a typed constant array, grouped by category, keyed by a stable string ID.
**When to use:** Small, static datasets that don't need user customization or admin management.
**Example:**
```typescript
// lib/data/writing-prompts.ts
export const PROMPT_CATEGORIES = ["gratitude", "reflection", "goals"] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export interface WritingPrompt {
  key: string;           // Stable ID stored in journal_entries.prompt_key (e.g., "gratitude-01")
  category: PromptCategory;
  i18nKey: string;       // Maps to i18n key: journal.prompts.gratitude01
}

export const WRITING_PROMPTS: WritingPrompt[] = [
  { key: "gratitude-01", category: "gratitude", i18nKey: "journal.prompts.gratitude01" },
  { key: "gratitude-02", category: "gratitude", i18nKey: "journal.prompts.gratitude02" },
  // ... 5-8 per category
];

// Helper: get prompts by category
export function getPromptsByCategory(category: PromptCategory): WritingPrompt[] {
  return WRITING_PROMPTS.filter((p) => p.category === category);
}

// Helper: find prompt by key (for displaying on re-open)
export function getPromptByKey(key: string): WritingPrompt | undefined {
  return WRITING_PROMPTS.find((p) => p.key === key);
}
```

### Pattern 2: Prompt Selection Flow in Journal Entry Modal
**What:** Add prompt state management to the existing `JournalEntryModal`, wire prompt_key into the autosave data.
**When to use:** When integrating prompt selection into the existing journal writing flow.
**Example:**
```typescript
// In JournalEntryModal -- add state:
const [promptKey, setPromptKey] = useState<string | null>(null);
const [promptSheetOpen, setPromptSheetOpen] = useState(false);

// Sync from loaded entry
useEffect(() => {
  if (entry) {
    setPromptKey(entry.prompt_key);
  }
}, [entry]);

// Include prompt_key in save data
scheduleSave({ content: json, mood, word_count: wc, prompt_key: promptKey });

// Handle prompt selection
const handlePromptSelect = useCallback((key: string) => {
  setPromptKey(key);
  setPromptSheetOpen(false);
  // Trigger save with new prompt_key
  scheduleSave({
    content: contentRef.current ?? entry?.content ?? null,
    mood,
    word_count: wordCount,
    prompt_key: key,
  });
  if (!isDirty) setIsDirty(true);
}, [/* deps */]);
```

### Pattern 3: Tiptap Placeholder Extension Integration
**What:** Add the Placeholder extension to the existing editor configuration for gentle empty-editor hints.
**When to use:** When the editor is empty and no prompt is selected (default free-form state).
**Example:**
```typescript
// Source: Tiptap v3 docs - Placeholder extension
// In journal-editor.tsx:
import { CharacterCount } from "@tiptap/extensions";
import { Placeholder } from "@tiptap/extensions";

const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CharacterCount,
    Placeholder.configure({
      placeholder: placeholderText ?? "Start writing...",
    }),
  ],
  content: content ?? undefined,
  immediatelyRender: false,
  // ...
});
```

**Required CSS (add to globals.css):**
```css
/* Source: Tiptap docs - Placeholder extension CSS */
.tiptap-journal .tiptap p.is-empty::before {
  color: theme('colors.muted-foreground');
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
```

### Pattern 4: Sheet Sidebar for Prompt Browsing
**What:** Use the existing Sheet component for the prompt browser, with Tabs for categories.
**When to use:** Sidebar panel pattern per user decision.
**Example:**
```typescript
// components/journal/prompt-browser-sheet.tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent side="right" className="w-full sm:max-w-md">
    <SheetHeader>
      <SheetTitle>{t("journal.prompts.title")}</SheetTitle>
    </SheetHeader>
    <Tabs defaultValue="gratitude">
      <TabsList className="w-full">
        {PROMPT_CATEGORIES.map((cat) => (
          <TabsTrigger key={cat} value={cat} className="flex-1">
            {t(`journal.prompts.categories.${cat}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      {PROMPT_CATEGORIES.map((cat) => (
        <TabsContent key={cat} value={cat}>
          <div className="space-y-2 mt-4">
            {getPromptsByCategory(cat).map((prompt) => (
              <button
                key={prompt.key}
                onClick={() => onSelect(prompt.key)}
                className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
              >
                {t(prompt.i18nKey)}
              </button>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  </SheetContent>
</Sheet>
```

### Anti-Patterns to Avoid
- **Storing prompt text in the database:** The `prompt_key` column stores only the key (e.g., `"gratitude-01"`), not the prompt text. This allows prompt text to be updated/improved without migrating data. The key is resolved to display text via i18n at render time.
- **Making prompts a gate/requirement:** Free-form must always be the default. The prompt browser is optional enhancement. Never require a prompt selection before writing.
- **Creating a separate API route for prompts:** With hardcoded prompts, there is no need for a `/api/prompts` endpoint. The prompt data is a client-side constant imported directly.
- **Passing prompt text to the editor as content:** The prompt should appear as a banner/card above the editor or as placeholder text -- never injected into the Tiptap document content itself. This keeps the user's actual writing clean.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidebar slide-in panel | Custom animated div with Portal | shadcn Sheet component | Already handles animations, focus trapping, overlay, mobile responsiveness, keyboard dismiss |
| Tab navigation for categories | Custom tab state management | shadcn Tabs (Radix Tabs) | Handles ARIA roles, keyboard navigation, focus management |
| Empty editor hint text | Manual DOM manipulation or conditional overlay | Tiptap Placeholder extension | Handles ProseMirror node decoration, CSS-based rendering, works with undo/redo, SSR-safe |
| Smooth sheet/tab animations | Custom CSS transitions | Built-in Sheet animations + Radix Tabs | Sheet has enter/exit animations via Tailwind animate classes |

**Key insight:** This phase is primarily a UI composition task. All the heavy lifting (sidebar panels, tabs, editor placeholders) is handled by existing components and extensions. The work is wiring them together with state management in the journal entry modal.

## Common Pitfalls

### Pitfall 1: Placeholder Extension Requires CSS
**What goes wrong:** Adding the Placeholder extension but seeing no placeholder text appear.
**Why it happens:** Tiptap Placeholder uses ProseMirror decorations that set a `data-placeholder` attribute on empty nodes. The actual rendering is CSS-based (`::before` pseudo-element), not JavaScript-based.
**How to avoid:** Add the CSS rule targeting `.tiptap-journal .tiptap p.is-empty::before` in `globals.css`. Use Tailwind's `theme()` function for color consistency.
**Warning signs:** Empty editor shows no hint text despite extension being configured.

### Pitfall 2: Prompt Key Not Included in First Save (POST)
**What goes wrong:** `prompt_key` is set in state but not included in the first autosave POST, resulting in null in the database.
**Why it happens:** The existing `scheduleSave` calls in `handleEditorUpdate` and `handleMoodChange` construct the save data object manually. If `prompt_key` is not added to those objects, it gets lost.
**How to avoid:** Ensure every `scheduleSave()` call includes `prompt_key` from the component state. Alternatively, centralize save data construction into a single helper function.
**Warning signs:** Entry created with a prompt shows `prompt_key: null` in the database.

### Pitfall 3: Sheet Inside Dialog Stacking Issues
**What goes wrong:** Opening a Sheet from inside a Dialog (the journal entry modal) can cause z-index stacking or focus-trap conflicts.
**Why it happens:** Both Sheet and Dialog use Radix UI's focus-trap mechanism. Nested portals can fight for focus.
**How to avoid:** The shadcn Sheet uses `z-50` (same as Dialog). Since Sheet renders in a Portal, it should stack on top. Test this interaction carefully. If focus-trap conflicts arise, consider using `modal={false}` on the Sheet or rendering the Sheet trigger outside the Dialog's focus scope.
**Warning signs:** Cannot interact with Sheet when Dialog is open, or Dialog steals focus back from Sheet.

### Pitfall 4: Tiptap Placeholder Not Updating Dynamically
**What goes wrong:** Changing the placeholder text (e.g., when a prompt is selected) doesn't update the visible placeholder.
**Why it happens:** Tiptap extensions are configured once at editor creation. The `placeholder` option is not reactive by default.
**How to avoid:** Two approaches: (1) Show the selected prompt as a banner/card above the editor instead of changing the editor placeholder, or (2) Use a ref to update the extension configuration. Approach (1) is simpler and recommended -- the Tiptap Placeholder shows a generic "Start writing..." hint, while the selected prompt appears as a visible card.
**Warning signs:** Placeholder text doesn't change after prompt selection.

### Pitfall 5: i18n Keys Not Added to All Three Locale Files
**What goes wrong:** Prompts work in English but crash or show raw keys in zh/zh-TW.
**Why it happens:** Forgetting to add i18n keys to all three locale files.
**How to avoid:** Per CLAUDE.md: "When adding new strings, add translations to all three locale files." Phase 25 handles actual Chinese translations, but the structure and English fallback keys must exist in all three files now.
**Warning signs:** `useTranslations()` returns raw key strings instead of translated text.

## Code Examples

Verified patterns from the existing codebase and official docs:

### Importing Placeholder from @tiptap/extensions (v3)
```typescript
// Source: Tiptap v3 migration guide - consolidated imports
// Same package already used for CharacterCount in journal-editor.tsx
import { CharacterCount, Placeholder } from "@tiptap/extensions";
```

### Placeholder CSS for the Journal Editor
```css
/* Source: Tiptap docs - Placeholder extension
   Add to app/globals.css inside .tiptap-journal section */
.tiptap-journal .tiptap p.is-empty::before {
  @apply text-muted-foreground/50;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
```

### Prompt Selection State in Journal Entry Modal
```typescript
// Extends existing JournalEntryModal state management pattern
const [promptKey, setPromptKey] = useState<string | null>(null);
const [promptSheetOpen, setPromptSheetOpen] = useState(false);

// Sync prompt_key from loaded entry (same pattern as mood sync)
useEffect(() => {
  if (entry) {
    setPromptKey(entry.prompt_key);
  }
}, [entry]);

// Handle prompt selection: set key, close sheet, trigger save
const handlePromptSelect = useCallback((key: string) => {
  setPromptKey(key);
  setPromptSheetOpen(false);
  if (!isDirty) setIsDirty(true);
  scheduleSave({
    content: contentRef.current ?? entry?.content ?? null,
    mood,
    word_count: wordCount,
    prompt_key: key,
  });
}, [isDirty, entry, scheduleSave, mood, wordCount]);

// Handle prompt dismissal
const handlePromptDismiss = useCallback(() => {
  setPromptKey(null);
  if (isDirty || entry) {
    scheduleSave({
      content: contentRef.current ?? entry?.content ?? null,
      mood,
      word_count: wordCount,
      prompt_key: null,
    });
  }
}, [isDirty, entry, scheduleSave, mood, wordCount]);
```

### Prompt Banner Component Above Editor
```typescript
// components/journal/prompt-banner.tsx
// Shows selected prompt text with dismiss option
interface PromptBannerProps {
  promptKey: string;
  onDismiss: () => void;
}

export function PromptBanner({ promptKey, onDismiss }: PromptBannerProps) {
  const t = useTranslations();
  const prompt = getPromptByKey(promptKey);
  if (!prompt) return null;

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
      <Lightbulb className="size-4 mt-0.5 text-primary shrink-0" />
      <p className="text-sm text-foreground flex-1">{t(prompt.i18nKey)}</p>
      <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
```

### i18n Namespace Structure for Prompts
```json
{
  "journal": {
    "prompts": {
      "title": "Writing Prompts",
      "trigger": "Need inspiration?",
      "categories": {
        "gratitude": "Gratitude",
        "reflection": "Reflection",
        "goals": "Goals"
      },
      "gratitude01": "What made you smile today?",
      "gratitude02": "Name three things you're thankful for right now.",
      "gratitude03": "Who is someone that made your day better?",
      "gratitude04": "What's a simple pleasure you enjoyed today?",
      "gratitude05": "What's something you often take for granted?",
      "reflection01": "What's one thing you'd change about today?",
      "reflection02": "What did you learn about yourself today?",
      "reflection03": "What challenged you today and how did you handle it?",
      "reflection04": "What emotion came up most today?",
      "reflection05": "What would your future self thank you for doing today?",
      "goals01": "What's one small step you can take toward a goal tomorrow?",
      "goals02": "What's something you've been putting off? Why?",
      "goals03": "Where do you want to be in 6 months?",
      "goals04": "What skill do you want to develop next?",
      "goals05": "What would make tomorrow a great day?"
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Individual Tiptap extension packages | Consolidated `@tiptap/extensions` import | Tiptap v3 | Import `{ Placeholder }` from `@tiptap/extensions`, not `@tiptap/extension-placeholder` |
| Text-based prompt storage | Key-based prompt reference | Industry standard | Store prompt key in DB, resolve to display text via i18n. Allows prompt text improvements without data migration. |

**Deprecated/outdated:**
- `@tiptap/extension-placeholder` package -- replaced by `@tiptap/extensions` in Tiptap v3 (already aligned in this project)

## Discretion Recommendations

Based on research and codebase analysis, here are recommendations for areas marked as Claude's discretion:

### Categories: Stick with 3 (gratitude, reflection, goals)
Three categories at 5 prompts each = 15 total prompts. This is scannable and manageable. Adding more categories increases cognitive load without clear benefit. The user requested these three specifically.

### Prompt Storage: Hardcoded in TypeScript
The codebase already uses hardcoded data for similar small static datasets (mood emojis in `JournalMoodSelector`, default category seeds). A database table adds migration complexity, an API route, and network latency for ~15 items. Hardcoded prompts with i18n keys are the simplest, most performant approach.

### Prompt Placement: Banner card above editor
Show the selected prompt as a styled card/banner between the mood selector and editor area. This keeps the prompt visible while writing without interfering with the editor content. The Tiptap Placeholder is used separately for the generic "Start writing..." hint when no prompt is selected.

### Dismissal Behavior: Allow change/dismiss at any time
The prompt is an optional guide, not a constraint. Allow users to dismiss the banner (set prompt_key to null) or open the prompt browser again to select a different prompt at any time. This matches the "free-form is default" philosophy.

### Selection Interaction: Single tap-to-select
No preview-then-confirm. This is a low-stakes selection -- the prompt text is short enough to read in the list. Tapping selects immediately, closes the sheet, and shows the banner. The user can always dismiss or change.

### First-use Experience: Self-explanatory (no onboarding)
A lightbulb/sparkles icon with "Need inspiration?" text is self-explanatory. No tooltip or onboarding modal needed. Keep it simple.

### Edit View: Show original prompt when re-opening
If an entry has a `prompt_key`, show the PromptBanner when the modal opens for editing. This provides context for why the entry was written. The user can dismiss it if they want.

### Trigger UI: Lightbulb icon with text label
Use `Lightbulb` (or `Sparkles`) from lucide-react with a subtle text label "Need inspiration?" positioned near the editor area. This is discoverable without being pushy.

## Open Questions

1. **Sheet-inside-Dialog stacking behavior**
   - What we know: Both Sheet and Dialog use Radix portals with z-50. In theory, the Sheet portal should stack on top of the Dialog portal.
   - What's unclear: Whether focus-trap conflicts occur in practice with this specific shadcn version.
   - Recommendation: Build and test early. If conflicts occur, use `modal={false}` on the Sheet or render the prompt trigger outside the Dialog's focus scope.

2. **Placeholder text source when prompt is selected**
   - What we know: Tiptap Placeholder is configured at editor creation and is not easily updated dynamically.
   - What's unclear: Whether using a prompt-specific placeholder (instead of a banner) would work with React state changes.
   - Recommendation: Use the banner approach (recommended above) to avoid this complexity entirely. Keep Placeholder as a static "Start writing..." hint.

## Sources

### Primary (HIGH confidence)
- `/ueberdosis/tiptap-docs` (Context7) - Placeholder extension configuration, CSS requirements, v3 consolidated imports
- Existing codebase files (verified by reading):
  - `supabase/migrations/20260222100001_create_journal_entries.sql` - `prompt_key TEXT` column
  - `lib/db/types.ts` - `JournalEntry.prompt_key: string | null`
  - `lib/validations/journal.ts` - `prompt_key: z.string().max(100).nullable().optional()`
  - `app/api/journal/route.ts` - POST handler passes `prompt_key` to upsert
  - `components/journal/journal-entry-modal.tsx` - Current modal structure and state management
  - `components/journal/journal-editor.tsx` - Current Tiptap editor configuration with `@tiptap/extensions`
  - `lib/hooks/use-journal-autosave.ts` - `scheduleSave` accepts `Record<string, unknown>`
  - `components/ui/sheet.tsx` - Sheet component (shadcn/Radix)
  - `components/ui/tabs.tsx` - Tabs component (shadcn/Radix)
  - `app/globals.css` - `.tiptap-journal` CSS namespace

### Secondary (MEDIUM confidence)
- Tiptap docs placeholder extension page (via Context7) - CSS pseudo-element pattern, dynamic placeholder function

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, import paths verified via codebase
- Architecture: HIGH - Directly extends existing modal/autosave patterns with well-understood UI primitives
- Pitfalls: HIGH - Sheet-in-Dialog stacking is the only uncertainty, mitigations identified

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (stable; no fast-moving dependencies)
