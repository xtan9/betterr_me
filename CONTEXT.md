# BetterR.Me

BetterR.Me organizes a person's self-directed work and wellbeing, including tasks that repeat on a schedule.

## Language

### Household Runway

**Household Runway Plan**:
A person's revisioned, committed financial inputs for evaluating how their household could withstand an interruption to income.
_Avoid_: Finance Cushion, saved assessment

**Household Runway Assessment**:
An evaluation of how long a household's resources could cover essential expenses under one or more income-interruption scenarios.
_Avoid_: Cushion, runway calculation, Plan

**Household Runway Interview**:
The guided process through which a person supplies and reviews the inputs used for a Household Runway Assessment.
_Avoid_: Wizard, finance form

**Household Runway Draft**:
The uncommitted working inputs maintained during a Household Runway Interview; it may coexist with a committed Household Runway Plan.
_Avoid_: Unsaved Plan, form state

**Household Runway Plan Adjustment**:
A provisional What-if overlay used to compare a Household Runway Assessment; it becomes part of a Plan only after the person applies it to the Draft inputs and commits them.
_Avoid_: Saved adjustment, Plan change

### Recurring Tasks

**Recurring Task Series**:
A user-visible lineage of repeating work that retains its identity across schedule and detail changes.
_Avoid_: Recurring task, template

**Series Revision**:
The definition of a Recurring Task Series effective over a bounded span of local dates.
_Avoid_: Template, version

**Series Defaults**:
The task details a Series Revision supplies to its Task Occurrences unless a person overrides them individually.
_Avoid_: Template fields

**Recurrence Anchor**:
The local date from which a recurrence pattern's phase is calculated.
_Avoid_: Start date

**Recurrence Rule**:
A supported schedule pattern that deterministically yields Scheduled Dates from a Recurrence Anchor. A requested calendar date missing from a month resolves to that month's last valid day.
_Avoid_: Recurrence JSON, schedule config

**Activation Date**:
The first local date on which a Recurring Task Series is allowed to schedule a Task Occurrence.
_Avoid_: Start date

**Task Occurrence**:
A dated task belonging to a Recurring Task Series and created under one Series Revision; it can be completed or changed independently.
_Avoid_: Instance, generated task

**Scheduled Date**:
The immutable local date position a Task Occurrence occupies in its Recurring Task Series, even when that task's due date is changed.
_Avoid_: Original date

**Skipped Occurrence**:
A Task Occurrence intentionally suppressed for its scheduled date while the surrounding Recurring Task Series continues.
_Avoid_: Deleted instance

**Withdrawn Occurrence**:
An untouched Open Occurrence removed because the Recurring Task Series no longer schedules that position after a pause, revision, or end.
_Avoid_: Skipped occurrence, deleted instance

**Open Occurrence**:
A Task Occurrence that has been neither completed nor skipped and can still be changed by a series-scoped action.
_Avoid_: Future instance

**Occurrence Override**:
An explicit replacement for one Series Default on one Task Occurrence; other defaults may still follow later Series changes while the occurrence remains open.
_Avoid_: Exception flag

**Extra Occurrence**:
An individually retained Task Occurrence whose Scheduled Date is no longer produced by the Series Revision effective for that date.
_Avoid_: Orphaned instance

**Occurrence Limit**:
The maximum number of retained Task Occurrences a Recurring Task Series may schedule, including occurrences later completed, changed, or skipped but excluding dates suppressed by a pause and untouched future occurrences withdrawn by a revision.
_Avoid_: End count, instances generated

**Last Scheduled Date**:
The inclusive final local date on which a Recurring Task Series may schedule a Task Occurrence.
_Avoid_: End date

**Coverage Horizon**:
The last local date through which a Recurring Task Series guarantees that every Scheduled Date has the correct Task Occurrence or intentional absence.
_Avoid_: Generation window, through date

**Active Series**:
A Recurring Task Series allowed to schedule Task Occurrences according to its current Series Revision.
_Avoid_: Enabled recurring task

**Paused Series**:
A Recurring Task Series that is temporarily inactive. It schedules no automatic Task Occurrences during the pause interval and does not fill that interval when it resumes.
_Avoid_: Disabled recurring task

**Ended Series**:
A Recurring Task Series that will never schedule another Task Occurrence but remains available as the lineage of its history.
_Avoid_: Deleted series, archived template
