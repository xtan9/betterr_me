# Concise assistant replies

Approved by the user: "ok do it", following the written four-part proposal in the conversation.

The problem is an assistant that reports missing data instead of helping with the next step. Remove automatic assumption-list appending from draft prose, including custom assumption arrays. Preserve structured readiness and assumptions for planning safeguards and preview review. Relevant uncertainty should be expressed naturally in the proposed step, never silently promoted to a fact.

Default response: briefly acknowledge relevant context, offer one small useful next step. Use ordinary conversation for illness, fatigue, overwhelm or informal advice when a useful response does not require dates. Ask at most one necessary question; do not initiate comprehensive schedule discovery unless the user is actually planning a schedule. Before proposing exact calendar writes, required date/time/availability must be explicitly established and exact acceptance retained.

Explicit requests for a full plan can still receive an appropriate outline. No new model, provider, model schema, persistence format, calendar mutation or front-end interaction is introduced. Existing unresolved-question safeguards and complete proposal review remain intact. Do not rewrite saved chat history or broadly strip user/model text with regexes.

Acceptance: Chinese/English skipped drafts no longer append any assumption inventory; internal unknowns and custom assumptions remain unchanged; fallback drafts do not dump known facts or invent times; illness, fatigue and incomplete-context conversation fixtures remain brief and nonmutating; relevant conflicts still ask one question; ordinary advice does not create planning state; date withdrawal and explicit skip remain safe; existing next-action availability and exact calendar acceptance tests pass. Deterministic fixtures establish server behavior; real-model language quality requires a separately identified live evaluation.

## Browser regression follow-up (2026-09-22)

User authorized fixing the live-browser failures: fatigue plus “one small step” was classified as task selection and replaced with a time question; interface English overrode an explicit Chinese reply request. Ordinary fatigue/illness/overwhelm advice must offer one untimed action directly. Explicit selection from existing tasks still requires confirmed availability. A generic next-step follow-up in a supportive conversation remains ordinary advice unless the user asks to select an existing task or fit work into confirmed availability.

The model now identifies `replyLocale` for prose and server-generated duration/recommendation text. Explicit language preference in the conversation wins, then current message language, then interface fallback. This optional generation field is not added to stored turn responses or the mobile API contract. Existing saved replies remain immutable. Fictional test scenarios must not create memories.

Automated coverage uses the existing POST boundary for JSON/streaming advice, duration choices and confirmed recommendations with mismatched interface/reply languages. Provider-dependent intent and language quality have a separately opt-in `ASSISTANT_ADVICE_LIVE=1` evaluation in `tests/lib/ai/assistant-advice.live.test.ts`; mocked tests alone do not establish model quality. Live browser verification uses the actual mobile UI and service, not fixture responses.

History additionally returns `planningSessionId` (including applied/cancelled sessions, or null when absent) from its existing owner/conversation-filtered session query. This additive field lets the mobile client repair legacy cross-conversation preview caches while retaining this conversation's undo/retry handles. It grants no new access, performs no writes and does not change immutable turn responses.

### Follow-up correction from deployed browser verification

The first fatigue reply passed, but clicking the English “What should I do next?” chip afterward still selected `next_action` and reverted to English. Prompt examples alone did not preserve the conversation. For the exact English/Chinese next-step suggestion in an existing chat, the server now reads the latest completed owner/conversation-scoped turn. After ordinary `conversation` advice, the generation schema constrains the continuation to conversation with no planning, task-selection window or actions. A fresh chat, prior planning/task-selection turn or an explicit request for an existing task retains the usual task-selection path and availability check.

Explicit Chinese/English reply directives in authoritative user-message history also constrain `replyLocale` and generation instructions; the most recent directive wins. Assistant text cannot set that preference. Other language formulations still use the model's existing language interpretation. No new persisted data or settings are introduced. JSON/streaming tests cover this continuation and schema guard, plus task-selection controls and an explicit language switch. Final verification must click the real suggestion after a fatigue response, not only resend isolated prompts.
