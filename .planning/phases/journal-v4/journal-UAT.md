---
status: complete
phase: journal-v4
source: v4.0-journal feature (PR #297)
started: 2026-02-27T00:00:00Z
updated: 2026-02-28T04:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Navigate to Journal Page
expected: Go to /journal. Page loads with "Journal" heading, a "Write today" button, streak badge, and two tabs: Calendar (default) and Timeline. Calendar shows current month.
result: pass

### 2. Calendar Mood Indicators
expected: Days that have journal entries show small mood emoji dots on the calendar. Days without entries have no dot. Future dates are disabled/unclickable.
result: issue
reported: "the calendar doesn't have any indicator when journal is created on that day."
severity: major

### 3. Create New Entry via "Write today"
expected: Click "Write today" button. A modal opens showing today's date, a rich-text editor with placeholder "Write something...", a mood selector row (5 emojis), and a word count in the footer.
result: issue
reported: "The placeholder is start writing, not write something..., and the word count only works for English it seems like, not Chinese."
severity: major

### 4. Rich-Text Formatting
expected: In the editor, type some text. Select text to see a floating bubble menu with bold/italic options. Use the toolbar to apply: bold, italic, headings (H2/H3), bullet list, numbered list, task list (checkboxes). All formatting renders correctly.
result: issue
reported: "The feature pass, but I like the floating bubble menu changed to a permanent menu."
severity: cosmetic

### 5. Select a Mood
expected: Click one of the 5 mood emojis. The selected emoji enlarges with a background highlight and ring. Click it again to deselect. Only one mood can be selected at a time.
result: pass

### 6. Auto-Save Entry
expected: Type content and select a mood in the modal. A save status indicator shows "Saving..." then "Saved" (checkmark). Close the modal. Reopen the same day's entry — your content and mood are preserved.
result: pass

### 7. Writing Prompts
expected: In the entry modal, click the "Prompts" button (lightbulb icon). A panel opens with writing prompt options. Select one — a banner displays the prompt text above the editor. Dismiss the banner with X. The prompt is saved with the entry.
result: issue
reported: "Prompt is not saved with entry. when I reopen, the prompt disappeared."
severity: major

### 8. Link Habits/Tasks to Entry
expected: In the entry modal, find the "Links" section. Click to add links. A selector shows your habits and tasks. Select items — they appear as removable chips. Click X on a chip to remove a link.
result: pass

### 9. Delete an Entry
expected: Open an existing entry. Click the trash icon in the top-right. A confirmation dialog appears. Confirm deletion — entry is removed, modal closes, and a "Entry deleted" toast notification appears.
result: issue
reported: "creating a journal for past days is not working, it says saved, but I can't see it when I close and open again. it was actually saved, but i have to refresh the page to see the saved change. the deletion is a pass"
severity: major

### 10. Timeline View
expected: On /journal, switch to the "Timeline" tab. Entries display in reverse chronological order as cards showing date, mood emoji, and preview text. Click a card to edit that entry.
result: issue
reported: "click on the card i can edit, it is saved, but i have to refresh the page to see the change. if i click the card again, in the editor, it was the old content, also in the card it shows the old content. i have to refresh the page."
severity: major

### 11. Timeline Load More
expected: If you have many entries, a "Load more" button appears at the bottom of the timeline. Clicking it loads older entries. If no entries exist, "No entries yet" message displays.
result: issue
reported: "the auto save is causing issue... not consistent enough. we need to fix."
severity: blocker

### 12. On This Day
expected: Below the calendar/timeline on /journal, an "On This Day" section shows entries from the same date in previous years. Each shows period label ("1 year ago"), mood emoji, and preview text. If none exist, shows "No entries from this day in previous years".
result: pass

### 13. Dashboard Journal Widget — Today's Entry
expected: Go to /dashboard. The Journal widget shows: title "Journal" with book icon, streak badge (if > 0), today's mood emoji and preview text (truncated). "View entry" link navigates to /journal.
result: pass

### 14. Dashboard Journal Widget — No Entry
expected: If no entry exists for today, the widget shows "Ready to journal today?" with grayed-out mood emojis and a "Start writing" button that navigates to /journal.
result: pass

### 15. Streak Tracking
expected: Create entries on consecutive days. The streak counter increments (shows as "X days" on journal page and dashboard widget). Milestone streaks (7, 14, 30, 60, 90, 180, 365) display in bold orange with animated flame. Missing a day resets the streak.
result: pass

### 16. Dark Mode
expected: Toggle to dark mode. All journal UI (page, modal, editor, calendar, widget) renders correctly with dark theme colors. No broken contrast or invisible text.
result: pass

### 17. i18n — Language Switching
expected: Switch locale to zh or zh-TW. All journal text translates: page title, button labels, tab labels, mood labels, empty state messages, and prompts.
result: pass

## Summary

total: 17
passed: 9
issues: 7
pending: 0
skipped: 0

## Gaps

- truth: "Calendar shows mood emoji dots on days with journal entries"
  status: failed
  reason: "User reported: the calendar doesn't have any indicator when journal is created on that day."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []

- truth: "Word count works for all languages including Chinese"
  status: failed
  reason: "User reported: the word count only works for English, not Chinese."
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []

- truth: "Writing prompt is persisted and displayed when reopening entry"
  status: failed
  reason: "User reported: Prompt is not saved with entry. when I reopen, the prompt disappeared."
  severity: major
  test: 7
  root_cause: ""
  artifacts: []
  missing: []

- truth: "SWR cache invalidates after saving/editing an entry — UI updates without page refresh"
  status: failed
  reason: "User reported: saved entries don't appear until page refresh. Affects calendar view, timeline view, and entry modal reopening."
  severity: blocker
  test: 9, 10, 11
  root_cause: ""
  artifacts: []
  missing: []

- truth: "Timeline updates after deleting an entry"
  status: failed
  reason: "User reported: after deletion, the timeline doesn't update."
  severity: major
  test: 15 (reported during)
  root_cause: ""
  artifacts: []
  missing: []

- truth: "Floating bubble menu replaced with permanent toolbar"
  status: failed
  reason: "User reported: wants floating bubble menu changed to a permanent menu."
  severity: cosmetic
  test: 4
  root_cause: ""
  artifacts: []
  missing: []
