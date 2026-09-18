# Issue 11: confirmed bookings

Approved scope: issue #11 and ios-mvp-spec.md. The test seams remain the approved authenticated command/readback boundary, constrained transaction/ownership fixtures and selected native UI/browser checks.

A booking is a completed task outcome; its visit is a separate protected calendar commitment whose visit status remains pending. Capture title, local date, start/end, explicit timezone and optional location. The confirmation screen states that the booking was already made outside the app. No external provider is contacted.

The new confirm-booking planner command uses the existing task completion preview and transaction, then inserts a protected visit with a distinct booking_task_id association (not task_id, which represents work reservations). Reuse occurrence-scoped completion if the booking task is recurring. Attach the created visit and its event/reminder version token to the same history record. The outer receipt atomically replaces the internal completion receipt; a retry returns the same visit/change IDs.

Undo checks all completion snapshots plus the created visit and reminder token before deleting that visit and restoring the booking task, exact occurrence if applicable, and released reservations. Newer edits to either side reject the entire Undo. Calendar retains and displays pending visits after the booking task completes. Ordinary event editing preserves booking metadata. No attendance operation is introduced.

Apply additive schema/command migration before client rollout. Roll back clients first and preserve visit associations, history and receipts. Verify duplicate confirmation, two-account links, conflicts, missing/invalid civil times, persistence, completion/Undo and forced transaction failure. Physical-device/TestFlight evidence remains deferred by the user while Apple membership is unavailable.
