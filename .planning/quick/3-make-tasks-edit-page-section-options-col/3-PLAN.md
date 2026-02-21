---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - app/globals.css
  - components/tasks/task-form.tsx
  - tailwind.config.ts
autonomous: true
requirements: [QUICK-3]

must_haves:
  truths:
    - "Section toggle items (Personal/Work) display distinct colors when selected"
    - "Section toggles are visually consistent with the category toggle color pattern"
    - "Colors work correctly in both light and dark mode"
  artifacts:
    - path: "app/globals.css"
      provides: "Section color CSS variables (light + dark)"
      contains: "--section-personal"
    - path: "tailwind.config.ts"
      provides: "Section color Tailwind mappings"
      contains: "section"
    - path: "components/tasks/task-form.tsx"
      provides: "Colored section toggle items"
      contains: "data-[state=on]:bg-section"
  key_links:
    - from: "components/tasks/task-form.tsx"
      to: "tailwind.config.ts"
      via: "Tailwind class usage"
      pattern: "bg-section-(personal|work)"
    - from: "tailwind.config.ts"
      to: "app/globals.css"
      via: "CSS variable reference"
      pattern: "--section-(personal|work)"
---

<objective>
Add colorful styling to the section toggle options (Personal/Work) on the task edit/create form, matching the existing color pattern used by category toggles.

Purpose: The section toggles currently use plain outline styling with no visual color differentiation when selected. Category toggles already have vibrant colored backgrounds when active. Section toggles should follow the same pattern for visual consistency and better UX.
Output: Section toggles that show distinct colors when selected (Personal = teal/green, Work = blue) in both light and dark mode.
</objective>

<execution_context>
@/home/xingdi/.claude/get-shit-done/workflows/execute-plan.md
@/home/xingdi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/tasks/task-form.tsx
@app/globals.css
@tailwind.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add section color CSS variables and Tailwind config</name>
  <files>app/globals.css, tailwind.config.ts</files>
  <action>
1. In `app/globals.css`, add section color CSS variables in the light theme `:root` block (after the category colors section around line 64):
   ```
   /* === Section colors === */
   --section-personal: 160 55% 45%;
   --section-personal-muted: 160 55% 93%;
   --section-work: 215 75% 55%;
   --section-work-muted: 215 75% 95%;
   ```
   Personal uses a teal/green hue (160) to pair with the User icon. Work uses blue (215, same as category-learning) to pair with the Briefcase icon.

2. In the `.dark` theme block (after the dark category colors around line 205), add dark mode variants:
   ```
   --section-personal: 160 45% 55%;
   --section-personal-muted: 160 30% 18%;
   --section-work: 215 60% 60%;
   --section-work-muted: 215 35% 18%;
   ```

3. In `tailwind.config.ts`, add a `section` color group inside `theme.extend.colors` (after the `category` group), following the exact same pattern:
   ```ts
   section: {
     personal: {
       DEFAULT: "hsl(var(--section-personal))",
       muted: "hsl(var(--section-personal-muted))",
     },
     work: {
       DEFAULT: "hsl(var(--section-work))",
       muted: "hsl(var(--section-work-muted))",
     },
   },
   ```
  </action>
  <verify>Run `pnpm build` to confirm no Tailwind config errors. Grep globals.css for `--section-personal` and `--section-work` to confirm variables exist in both light and dark blocks.</verify>
  <done>Section CSS variables defined in both light/dark themes. Tailwind `section` color group registered. Build passes.</done>
</task>

<task type="auto">
  <name>Task 2: Apply colorful styles to section ToggleGroupItems</name>
  <files>components/tasks/task-form.tsx</files>
  <action>
In `components/tasks/task-form.tsx`, update the section `ToggleGroup` (around lines 214-229) to add colored backgrounds when selected, using the same `data-[state=on]` pattern as the category toggles.

Change the two `ToggleGroupItem` elements:

For "personal":
```tsx
<ToggleGroupItem
  value="personal"
  className="flex-1 gap-1.5 data-[state=on]:bg-section-personal data-[state=on]:text-white"
>
```

For "work":
```tsx
<ToggleGroupItem
  value="work"
  className="flex-1 gap-1.5 data-[state=on]:bg-section-work data-[state=on]:text-white"
>
```

This mirrors the exact pattern used by CATEGORY_OPTIONS (lines 60-81) where each option has a `colorClass` with `data-[state=on]:bg-category-* data-[state=on]:text-white`.

After the change, run `pnpm lint` and fix any lint errors.
  </action>
  <verify>Run `pnpm lint` to confirm no lint errors. Run `pnpm test:run -- --testPathPattern task-form` to confirm existing tests pass. Visually: the section toggles should show teal (Personal) or blue (Work) backgrounds when selected.</verify>
  <done>Section toggle items display colorful backgrounds when selected: teal for Personal, blue for Work. Existing tests pass. Lint passes.</done>
</task>

</tasks>

<verification>
- `pnpm build` passes without errors
- `pnpm lint` passes without errors
- `pnpm test:run` passes (at least task-form related tests)
- Section toggles in task form show colored backgrounds when active, white text on colored background
- Colors render correctly in both light and dark mode (CSS variables defined for both)
</verification>

<success_criteria>
Section toggle options (Personal/Work) on the task edit/create form display distinct, vibrant colors when selected, consistent with the existing category toggle color pattern. Both light and dark mode are supported.
</success_criteria>

<output>
After completion, create `.planning/quick/3-make-tasks-edit-page-section-options-col/3-SUMMARY.md`
</output>
