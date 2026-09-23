# Respect a decision the user has already made

Approved bug correction: user requested “请修复” on 2026-09-23 after the screenshot and proposed brief acknowledgement plus “看看今天的安排 / 暂时不用” suggestions.

When a person has decided what to do (for example, going to urgent care after discussing feeling unwell), acknowledge the decision briefly rather than repeating a next-step checklist. Offer at most one relevant planning question with two inline text suggestions. Merely stating a decision is not consent to create tasks or revise the calendar. Do not invent a sickness mode or claim to have reviewed the calendar before reading it.

Reuse the existing quick-reply contract and ordinary message sending path. “看看今天的安排” requests a review and proposed adjustments only; “暂时不用” ends the offer without repeating it. Requests for practical details still receive the requested details. New, explicit imminent danger must not be suppressed by the brevity rule. Avoid routine medical checklists and diagnoses; this change adds no medical capability.

Acceptance: Chinese and English decision acknowledgements are brief (target 1–2 sentences), have no routine packing/transport/symptom checklist or repeated “最小下一步” label, and offer the localized two choices when day review is relevant. Offers contain no capture actions, planning draft, availability window or calendar-preview handle. Declining is acknowledged without renewed suggestions. Accepting requests review using existing planning and exact-proposal acceptance. No new memory policy, calendar mutation, native layout redesign or external integration.

Test at the already agreed POST /api/mobile/assistant and assistant screen boundaries, with provider fixtures for transport/contracts and separately identified real-model browser testing for content quality. Include the multi-turn decision, decline, review choice and explicit detail-request controls. An old bubble partially visible at the top of a scrolled chat is not by itself evidence of a layout bug; verify scroll/header separation before changing it.
