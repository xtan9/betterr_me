# Issue 4: shared projects and children

Scope: approved mobile issue #4, AC14/20/23. Projects map to public.projects (name, status active/archived); children are existing public.tasks rows referenced by project_id. No task copies, new completion semantics, or calendar mutations. Active means explicitly open even with zero open children. Open children exclude archived and completed tasks.

Preserve section, color, sort_order, and all richer task fields. Name-only edits patch name. Project archive patches status only. Child archive uses task_capture_command. Relationship edits extend that command, preserve task identity and use recurring occurrence overrides for recurring children. A null project_id detaches a task. Creation with a project is atomic.

Add projects.version, advanced on every writer, and protected operation receipts. Require exact project/task versions for mobile mutations, including the destination project version for attachment. Serialize retries and reject changed payloads. Enforce same-owner task/project relationships for new writes with a NOT VALID composite foreign key, preserving legacy rows for separate audit rather than rewriting them. Existing clients remain compatible; legacy unversioned writes advance versions but retain their legacy concurrency behavior.

Schema belongs in the web repository, companion branch codex/mobile-projects. Deploy additive migration before the mobile release. Roll back clients first and retain versions and receipts; never drop saved projects or links. No production migration is run to satisfy tests.

Verification: authenticated local Supabase create/read/edit, atomic child creation, cross-owner rejection, retry, concurrent stale move rejection, recurrence preservation, independent archive, and new-client persistence; native screen error/retry, locale and empty-project behavior; typecheck, lint, full native suite and iOS export; independent PR review and browser smoke comment. Browser/export evidence is not physical-iPhone evidence. Record any hosted/device release gates honestly.
