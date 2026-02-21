---
status: testing
phase: 16-integration-bug-fixes
source: [16-01-SUMMARY.md, 16-02-SUMMARY.md]
started: 2026-02-21T13:00:00Z
updated: 2026-02-21T13:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Create task with Work section
expected: |
  On the tasks page, click "Create Task". In the form, select "Work" as the section. Fill in a task name and submit. The new task appears in the Work section on the tasks page (not in Personal).
awaiting: user response

## Tests

### 1. Create task with Work section
expected: On the tasks page, click "Create Task". In the form, select "Work" as the section. Fill in a task name and submit. The new task appears in the Work section on the tasks page (not in Personal).
result: [pending]

### 2. Create task with project assignment
expected: On the tasks page, click "Create Task". Select a section, then pick an existing project from the project dropdown (filtered by section). Submit. The task appears inside that project's card on the tasks page, and shows on that project's kanban board.
result: [pending]

### 3. Edit task project assignment
expected: On the tasks page or kanban board, edit an existing task. Change its project assignment to a different project (or clear it). Save. The task moves to the new project (or becomes standalone) and persists after page reload.
result: [pending]

### 4. Kanban drag-drop board integrity
expected: Open a project's kanban board with tasks in multiple columns. Drag a card from one column to another. After the drop: all columns remain populated (no columns go empty or lose cards), the moved card is in its new column, and the change persists after page reload.
result: [pending]

### 5. Archived projects navigation link
expected: On the tasks page, look at the page header area. An "Archived" link/button is visible (ghost style). Clicking it navigates to the archived projects page (/projects/archived).
result: [pending]

### 6. Archived link i18n
expected: Switch language to Chinese (zh or zh-TW). The "Archived" link on the tasks page displays the translated text ("已归档" for zh, "已封存" for zh-TW).
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0

## Gaps

[none yet]
