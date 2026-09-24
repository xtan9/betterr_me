# Assistant usability follow-up

Approved by the user's “do it” after the September 23 usability report (8 scenarios, 14 real replies). Implement the reported P1/P2 corrections at the existing assistant API, chat screen and proposal boundaries.

- Cancelling an unaccepted calendar draft ends its active session, removes its preview across replies/history/reload, and invalidates stale acceptance. Do not cancel an applied plan or lose its undo/uncertain-command recovery. Cancellation is owner-scoped, versioned and committed with the assistant turn.
- Task previews show meaningful changes, omit empty creation fields and technical before/after wording for creation, and allow conversational revision. Supersede the old preview before replacing it; never apply either without exact confirmation. Failed rejection keeps its command identity and the user's edit.
- Conflict questions preserve explicitly fixed constraints. Ask only about a genuinely changeable condition; do not casually offer a time the user just ruled out.
- Empty task recommendations remain honest and offer two lightweight text suggestions: a small action or rest. Those choices continue ordinary conversation without another availability questionnaire or a task/calendar mutation.
- A request for a clickable preview must produce an actual structured proposal, not prose pretending to be controls. A fictional illustration may remain prose, but must not claim to have clickable controls.

Reuse existing contracts where possible; the additive cancellation handle is optional for older clients. No new app mode, model change, global language change, calendar write without acceptance, or memory policy. Keep existing applied-plan recovery and idempotency. Broader card-language and all-assumptions redesign remain follow-up, not this scope.

Acceptance: Chinese/English cancellation, immutable-turn retry, persisted history, new-plan restart, applied-plan protection; concise one/multiple-item creation previews, visible edit composer, old-preview rejection before revised proposal, reject failure/retry and current-version acceptance; selected-task versus empty-result choices and ordinary fallback; real-provider narrow-plan conflict and cancellation checks. Contract fixtures prove state behavior; browser observations separately assess wording.
