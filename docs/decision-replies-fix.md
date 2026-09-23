# Respect a decision the user has already made

Approved bug correction: user requested “请修复” on 2026-09-23 after the screenshot and proposed brief acknowledgement plus “看看今天的安排 / 暂时不用” suggestions.

When a person has decided what to do (for example, going to urgent care after discussing feeling unwell), acknowledge the decision briefly rather than repeating a next-step checklist. Offer at most one relevant planning question with two inline text suggestions. Merely stating a decision is not consent to create tasks or revise the calendar. Do not invent a sickness mode or claim to have reviewed the calendar before reading it.

Reuse the existing quick-reply contract and ordinary message sending path. “看看今天的安排” requests a review and proposed adjustments only; “暂时不用” ends the offer without repeating it. Requests for practical details still receive the requested details. New, explicit imminent danger must not be suppressed by the brevity rule. Avoid routine medical checklists and diagnoses; this change adds no medical capability.

Acceptance: Chinese and English decision acknowledgements are brief (target 1–2 sentences), have no routine packing/transport/symptom checklist or repeated “最小下一步” label, and offer the localized two choices when day review is relevant. Offers contain no capture actions, planning draft, availability window or calendar-preview handle. Declining is acknowledged without renewed suggestions. Accepting requests review using existing planning and exact-proposal acceptance. No new memory policy, calendar mutation, native layout redesign or external integration.

Test at the already agreed POST /api/mobile/assistant and assistant screen boundaries, with provider fixtures for transport/contracts and separately identified real-model browser testing for content quality. Include the multi-turn decision, decline, review choice and explicit detail-request controls. An old bubble partially visible at the top of a scrolled chat is not by itself evidence of a layout bug; verify scroll/header separation before changing it.

## Detailed regression follow-up

User requested detailed verification of this and earlier assistant failures. Cover fatigue/illness/overwhelm, generic next-step continuation, settled decisions in both languages, decline and explicit detail requests, new imminent danger, day-review suggestions, planning with missing details, no preview while thinking, new-chat/reload isolation, stop/retry and exact acceptance protections. Real model quality and rendered interactions must be distinguished from fixture tests.

The E2E environment was blocked by repeated GHCR throttling before application tests. The pinned setup-cli action exports a GHCR registry override; the pinned CLI 2.109.1 disables its built-in registry fallback whenever that override is set. Clear it only for disposable PR database startup to restore the CLI's own ECR, GHCR and original image candidates, preserving pinned versions and every SQL/browser/merge gate. Sources: https://github.com/supabase/cli/blob/v2.109.1/apps/cli-go/internal/utils/docker.go and https://github.com/supabase/setup-cli/blob/46f7f98c7f948ad727d22c1e67fab04c223a0520/src/main.ts . Verify by the actual PR E2E startup and tests; no synthetic assertion is claimed as download verification.
