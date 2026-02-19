# BetterR.Me - Product Requirements Document

## V2.0 - Consolidated Master PRD

**Date:** February 18, 2026
**Version:** 2.0
**Status:** Living Document
**Supersedes:** `BETTERR_ME_PRD_V1.md` (Feb 2, 2026), `BETTERR_ME_PRD_V1.2.md` (Feb 3, 2026)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 2, 2026 | Initial PRD — lean V1 scope, competitive landscape, retention strategy |
| 1.2 | Feb 3, 2026 | Added Mood Check-ins spec, 4th persona, competitive positioning matrix |
| 2.0 | Feb 18, 2026 | **Consolidated master PRD.** Reflects shipped reality (V1.0 through V2.1), removes engineering content, adds roadmap options and CEO open questions. Supersedes all prior versions. |

---

## 1. Executive Summary

BetterR.Me is a **daily operating system for self-improvement** that helps anyone become a better version of themselves through consistent habit building, task execution, and behavioral self-coaching.

**Core Thesis:** Users return daily when the app creates an addictive daily ritual around tracking habits, seeing streaks, receiving behavioral insights, and feeling emotionally guided — not just checked off.

**Where We Are Today:**

| Vital Sign | Status |
|------------|--------|
| Product stage | Fully functional, shipped to production |
| Features shipped | Habits, Tasks, Recurring Tasks, Dashboard, Weekly Insights, Streak Milestones, Absence Recovery |
| Milestones completed | 6 (V1.0 through Recurring Tasks) |
| Automated tests | 1,084+ |
| Locales supported | 3 (English, Simplified Chinese, Traditional Chinese) |
| Dark mode | Full support with 56 semantic design tokens |
| Mobile | Responsive web (no native app yet) |

**What's Next:** Mood Check-ins, notifications, habit templates, and mobile — pending CEO prioritization (see Section 14).

---

## 2. Vision, Mission, and Values

### Vision

"BetterR.Me is where users go every day to become the best version of themselves — through building consistent habits, executing on daily priorities, receiving behavioral insights, and feeling guided through the ups and downs of self-improvement."

### Mission

Build the most retention-focused self-improvement platform in the market. Not the most features — the deepest engagement.

### Core Values

| Value | What It Means |
|-------|---------------|
| **Simplicity First** | No friction between intention and action. Checking off a habit is one tap. |
| **Progress Visible** | Make it impossible to ignore your improvement. Streaks, heatmaps, insights. |
| **Compassionate** | Streaks break. We don't shame users. We help them recover. |
| **Multi-lingual** | English, Simplified Chinese, and Traditional Chinese are first-class citizens. |

---

## 3. Market Context and Competitive Positioning

### Market Opportunity

- **TAM (2026):** $14.94 billion globally (habit tracking + personal productivity)
- **Key Insight:** 52% of users drop off within 30 days across ALL habit apps. Retention, not features, is the unsolved problem.
- **Key Gaps in Market:**
  - No competitor wins on retention/engagement
  - True AI personalization is nascent
  - Cross-platform excellence is rare
  - Coaching integration (not just tracking) is unexplored

### Competitive Landscape

| Competitor | Strength | Weakness | Audience |
|-----------|----------|----------|----------|
| **Habitica** | Gamification, community | Niche appeal (RPG-heavy) | Gamers |
| **Streaks** | Beautiful design | iOS-only | Apple devotees |
| **Loop** | Privacy-first, free | No engagement hooks | Privacy enthusiasts |
| **Habitify** | Most integrations + AI | Over-featured, less polished | Feature lovers |
| **Strides** | Goals + habit combo | Limited social features | Goal-setters |

### BetterR.Me's Differentiators

| Dimension | BetterR.Me | Habitica | Streaks | Loop | Habitify |
|-----------|-----------|---------|---------|------|----------|
| Simplicity | +++++ | +++ | +++++ | +++++ | ++++ |
| Habits + Tasks | +++++ | +++++ | ++++ | +++ | ++++ |
| Design | ++++ | +++ | +++++ | ++++ | ++++ |
| Retention mechanics | +++++ | ++++ | +++ | +++ | +++ |
| Self-coaching | +++++ | + | + | + | + |
| Cross-platform | ++++ | ++++ | ++ | +++ | ++++ |
| Multilingual | +++++ | +++ | ++ | ++ | +++ |
| Accessibility | ++++ | ++ | +++ | +++ | +++ |

**Our edge:** Self-coaching features (absence recovery, weekly insights, completion reflections, intention setting) — no competitor does this. We also have recurring tasks with full scope editing (this/following/all instances) comparable to Google Calendar.

---

## 4. User Personas

### Persona 1: The Consistency Builder

| | |
|---|---|
| **Goal** | Build sustainable habits (meditation, exercise, reading) |
| **Motivation** | Streaks, seeing long-term patterns |
| **Usage** | Daily, 2-3 minutes |
| **Quote** | "I want a 365-day meditation streak" |
| **Served by** | Habit system, streak milestones, 30-day heatmaps, absence recovery |

### Persona 2: The Productivity Warrior

| | |
|---|---|
| **Goal** | Execute priorities and get work done |
| **Motivation** | Completing tasks, clearing backlog |
| **Usage** | 2-3x daily |
| **Quote** | "I want to ship my best work every day" |
| **Served by** | Task system, recurring tasks, intention field, completion reflections |

### Persona 3: The Data Junkie

| | |
|---|---|
| **Goal** | Track everything and understand patterns |
| **Motivation** | Dashboard metrics, trends, insights |
| **Usage** | Daily + weekly reviews |
| **Quote** | "I want to know if better sleep correlates with productivity" |
| **Served by** | Weekly insights, habit stats, task horizon |

### Persona 4: The Self-Awareness Seeker *(Future)*

| | |
|---|---|
| **Goal** | Understand emotional patterns and triggers |
| **Motivation** | Mental health improvement, therapy support |
| **Usage** | As-needed (during emotional moments) + weekly review |
| **Quote** | "I want to track when I feel anxious so I can discuss patterns with my therapist" |
| **Served by** | Mood Check-ins *(not yet built — see Appendix A)* |

---

## 5. What We've Built

This is the centerpiece — everything below is shipped and in production.

### Habits

| Capability | Details |
|-----------|---------|
| **Create habits** | Name, description, category (Health / Wellness / Learning / Productivity / Other), 5 frequency types, 20-habit limit per user |
| **Frequency types** | Daily, Weekdays (Mon-Fri), Weekly (any day counts), Times per week (2x or 3x), Custom days |
| **1-click tracking** | Toggle completion from dashboard; edit past logs up to 7 days back |
| **Streak system** | Frequency-aware calculation (counts only scheduled days), adaptive lookback (30-365 days based on streak length), paused habits freeze streak |
| **30-day heatmap** | Calendar visualization on habit detail page (green = done, gray = missed) |
| **Status management** | Active, Paused, Archived |

### Streak Milestones and Celebrations

| Capability | Details |
|-----------|---------|
| **Milestone thresholds** | 7, 14, 30, 50, 100, 200, 365 days |
| **Celebration cards** | Appear on dashboard when a habit hits a milestone |
| **Next milestone indicator** | Shown on habit detail page ("X days to your Y-day milestone!") |
| **Milestone history** | Stored for long-term tracking |

### Absence-Aware Recovery (3-Tier)

| Tier | Trigger | Tone | Message |
|------|---------|------|---------|
| **Recovery** | 1 missed scheduled day | Amber, light | "Never miss twice" |
| **Lapse** | 2-6 missed scheduled days | Blue, honest | "No judgment — restart today" |
| **Hiatus** | 7+ missed scheduled days | Warm, welcoming | "Welcome back! Resume, pause, or change frequency?" |

- Max 3 cards on dashboard, prioritized by severity
- Frequency-aware: counts only scheduled days as missed (a weekly habit with no log for 3 calendar days is not a miss)
- Based on James Clear's "Never Miss Twice" rule and the "what-the-hell effect" (abandonment spiral) research

### Tasks

| Capability | Details |
|-----------|---------|
| **Create tasks** | Title, description, priority (None / Low / Medium / High), due date, due time, category (Work / Personal / Shopping / Other) |
| **Intention field** | Optional "Why does this matter to you?" prompt — based on implementation intention research (Gollwitzer, 1999) |
| **Completion reflection** | For high-priority tasks or tasks with an intention: inline emoji strip (Easy / Good / Hard), 3-second auto-dismiss |
| **Task horizon** | "Coming Up (Tomorrow)" section on dashboard shows up to 3 upcoming tasks; auto-expands when today's tasks are done |

### Recurring Tasks

| Capability | Details |
|-----------|---------|
| **Supported patterns** | Daily, Every N days, Weekly on specific days, Biweekly, Monthly by date, Monthly by weekday, Yearly |
| **End conditions** | Never, After N times, On specific date |
| **Edit/delete scope** | This instance only, This and following, All instances (Google Calendar style) |
| **Generation model** | 7-day rolling window, no background jobs — instances appear automatically when the user opens the app |
| **Full feature parity** | Recurring instances support all task features (reflection, intention, priority, categories) |

See `FEATURE_RECURRING_TASKS.md` for the full feature specification.

### Dashboard

| Element | Details |
|---------|---------|
| **Daily snapshot** | Habits completed, tasks completed, best streak |
| **Absence cards** | Up to 3 recovery/lapse/hiatus cards for missed habits |
| **Milestone celebrations** | Cards when a habit hits a streak milestone |
| **Weekly insight card** | One behavioral insight per week on the configured week start day |
| **Habit checklist** | All active habits with 1-click toggle |
| **Tasks today** | Today's tasks + "Coming Up" tomorrow preview |
| **Motivational message** | Priority-based, contextual encouragement with colored background |
| **Time-based greeting** | Good Morning / Good Afternoon / Good Evening |

### Weekly Insights

| Capability | Details |
|-----------|---------|
| **Insight types** | Streak proximity, best week, best habit, worst day, improvement trend, decline warning |
| **Priority ranking** | Urgent (streak proximity) > celebration > correction > generic |
| **Frequency** | One insight per week on the user's configured week start day |
| **Dismissible** | Stores dismissal locally; shows only once per week |

Based on behavioral self-awareness research — reflecting on patterns (not just data) helps users understand their behavior and make intentional adjustments.

### Design System

| Capability | Details |
|-----------|---------|
| **Navigation** | Collapsible sidebar with icon containers, teal hover/active states, user footer |
| **Layout** | Card-on-gray pattern throughout |
| **Design tokens** | 56 semantic CSS tokens for categories, priorities, status indicators |
| **Dark mode** | Full support across all pages |
| **Responsive** | Desktop-first with mobile web support |

### Internationalization

| Locale | Status |
|--------|--------|
| English (en) | Full coverage |
| Simplified Chinese (zh) | Full coverage |
| Traditional Chinese (zh-TW) | Full coverage |

All UI strings translated across 7 namespaces. Known limitation: recurrence descriptions (e.g., "Every week on Mon, Wed, Fri") are English-only for now.

---

## 6. Retention Mechanics

| Hook | Feature | Behavioral Principle | Status |
|------|---------|---------------------|--------|
| Daily Ritual | Time-based greeting, progress comparison | Habit loop (Duhigg) | Shipped |
| Quick Wins | 1-click habit completion, instant visual feedback | Dopamine loop, variable reward | Shipped |
| Streak Loss Aversion | Large streak counter, 30-day heatmap | Loss aversion (Kahneman) | Shipped |
| Milestone Celebrations | Cards at 7/14/30/50/100/200/365 days | Variable reward scheduling | Shipped |
| Absence Recovery | 3-tier recovery cards ("never miss twice") | Implementation intention (Clear) | Shipped |
| Completion Reflection | Post-task reflection for meaningful tasks | Selective metacognitive reflection | Shipped |
| Weekly Insights | Behavioral pattern recognition | Self-awareness coaching | Shipped |
| Task Horizon | Tomorrow preview, anxiety reduction | Zeigarnik effect | Shipped |
| Intention Setting | "Why This Matters" prompt for tasks | Implementation intention (Gollwitzer) | Shipped |

---

## 7. User Flows

### Flow 1: Onboarding (~5 minutes)

1. Sign up / Log in
2. Set basic preferences (theme, language, week start day)
3. Create first habit (e.g., "Meditate 10 min")
4. Create first task (e.g., "Check email")
5. See dashboard with habit + task
6. Check off habit — see streak appear
7. Mark task complete — see dashboard update
8. Done! User has first-day momentum

### Flow 2: Daily Usage (~2-3 minutes)

1. Open app — see dashboard with greeting
2. Check off completed habits (1-click each)
3. Review and address any absence recovery cards
4. Mark priority tasks done / adjust priorities
5. (Optional) View streaks / weekly stats
6. Come back tomorrow

### Flow 3: Weekly Reflection (~5 minutes)

1. See weekly insight card on configured week start day
2. Review which habits are thriving vs struggling
3. Adjust next week's focus (pause struggling habits, add new ones)
4. Dismiss insight card

### Flow 4: Missed Day Recovery

1. Return after missing one or more days
2. See absence card(s) on dashboard — tone adapts to how long you've been away
3. **Recovery (1 day):** Complete habit to get back on track
4. **Lapse (2-6 days):** Restart with encouragement, see previous streak as motivation
5. **Hiatus (7+ days):** Choose to resume, pause, or change frequency — warm welcome, no guilt

### Flow 5: Recurring Task Management

1. Create a task with a recurrence pattern (daily, weekly, etc.)
2. Instances appear automatically on the dashboard each day
3. Complete today's instance — tomorrow's is already waiting
4. Need to change one instance? Edit "this instance only"
5. Need to change the schedule? Edit "this and following" or "all instances"
6. Need to stop? Pause or delete with scope options

---

## 8. Milestones Shipped

| Milestone | Date | Highlights |
|-----------|------|------------|
| **V1.0 Codebase Hardening** | Feb 16, 2026 | 5 phases, 116 files changed, +13K lines. Fixed frequency accuracy, wired validation, added adaptive streak lookback, backfilled 71 tests. |
| **V1.1 Dashboard Task Fixes** | Feb 17, 2026 | Fixed timezone-based task duplication. Dashboard completed tasks now included in counts. |
| **V2.0 UI Style Redesign** | Feb 17, 2026 | 9 phases. Sidebar navigation, card-on-gray layouts, design token foundation. |
| **V2.1 UI Polish & Refinement** | Feb 18, 2026 | 3 phases. 56 semantic design tokens, spacing standardization, sidebar refinement. |
| **Vertical Depth Features** | Feb 18, 2026 | All 6 self-coaching features shipped: intention field, task horizon, absence recovery, streak milestones, completion reflection, weekly insights. |
| **Recurring Tasks** | Feb 18, 2026 | Template + on-demand instance model. Full scope editing (this/following/all). 7 recurrence patterns, 3 end conditions. |

This represents significant velocity — 6 milestones in 3 days of development.

---

## 9. Key Strategic Decisions

| # | Decision | Rationale | Outcome |
|---|----------|-----------|---------|
| 1 | **Lean V1, iterate fast** | Retention is driven by daily ritual, not features. 52% drop-off happens regardless of feature count. | Good — shipped fast, iterated based on findings. |
| 2 | **Retention-first, not feature-first** | Competitors fail because they optimize for feature count. We optimize for "Will this get users to open the app tomorrow?" | Good — 9 retention hooks shipped. |
| 3 | **Defer mobile apps to V2+** | Web works on mobile browsers. Native apps don't unlock core value yet. | Good — avoided 2-3 months of mobile dev. |
| 4 | **No leaderboards in V1** | Social comparison can feel toxic. Establish individual streaks first, layer social later with care. | Good — individual focus creates safety. |
| 5 | **Defer AI to V3+** | V1-2 collect behavioral data. V3 uses that data for personalization. Premature personalization = poor recommendations. | Good — collecting data now. |
| 6 | **7-day edit window for habit logs** | Balance between allowing mistake corrections and preventing streak gaming. Fix yesterday's forgotten log, but can't retroactively build fake streaks. | Good — no abuse reported. |
| 7 | **Self-coaching over gamification** | Absence recovery, reflections, and insights build genuine self-awareness. Gamification (points, badges, levels) can feel hollow. | Good — differentiator vs competition. |
| 8 | **Hybrid recurring task model** | No background jobs needed. Works with existing infrastructure. Individual instance editing supported. | Good — zero operational overhead. |
| 9 | **Client-sent dates** | Server timezone (UTC on deployment platform) doesn't match user timezone. The client knows the correct local date. | Good — eliminated timezone bugs. |
| 10 | **Selective completion reflection** | Only prompt reflection for high-priority or intentional tasks. Low-priority busywork checks off silently. Avoids nag fatigue. | Good — engagement without annoyance. |

---

## 10. Quality and Reliability

| Area | Details |
|------|---------|
| **Automated tests** | 1,084+ tests across unit, integration, and end-to-end layers |
| **Input validation** | All user input validated at the boundary before it reaches the database |
| **Accessibility** | WCAG 2.1 Level AA target. Keyboard navigation, screen reader support, color contrast compliance, automated accessibility testing in component tests |
| **Error handling** | Consistent error responses, graceful degradation (e.g., one failing recurring task template doesn't block the dashboard) |
| **Data safety** | Row-level security policies ensure users can only access their own data. No cross-user data leakage possible at the database level. |
| **Internationalization** | All user-facing strings translated across 3 locales |

---

## 11. Success Metrics

### Engagement

| Metric | Target |
|--------|--------|
| DAU (Daily Active Users) | 50% of signups |
| Day 1 retention | 90% |
| Day 3 retention | 60% |
| Day 7 retention | 45% |
| Day 30 retention | 25% (industry avg ~15%) |
| Session duration | 2-3 minutes average |
| Sessions per day | 1-2 (morning check, evening review) |

### Habit Health

| Metric | Target |
|--------|--------|
| Habits per user | 4-7 average |
| Habit completion rate | 70%+ on active habits |
| Average streak length | 20+ days |
| Habit abandonment rate | <20% of created habits paused/deleted |

### Task Health

| Metric | Target |
|--------|--------|
| Tasks per user per day | 3-5 |
| Task completion rate | 75%+ |
| Recurring task adoption | 30%+ of active users create at least 1 recurring task within 2 weeks |

### Product Health

| Metric | Target |
|--------|--------|
| Error-free sessions | >99% |
| Page load time | <2 seconds |
| Error rate | <0.1% |
| Accessibility score | 90+ (Lighthouse) |

### A/B Testing Candidates

- Impact of streak counter on retention
- Impact of daily comparison (vs yesterday) on retention
- Impact of celebration messages on retention
- Impact of 30-day heatmap visualization on retention
- Impact of absence recovery cards on Day 30 retention
- Impact of weekly insights on weekly active users

---

## 12. Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **30-day drop-off** | High | High | 9 retention hooks shipped. A/B test onboarding flow. Early user interviews. Monitor Day 3/7/30 cohorts. |
| **Feature bloat** | Medium | High | Strict scope discipline — defer to feature PRDs. CEO approves roadmap items. |
| **No monetization model** | High | Medium | Product-market fit first. Monetization is a V3+ concern. See Open Questions (Section 15). |
| **Mobile gap** | Medium | Medium | Responsive web works on mobile browsers. Native apps deferred to V2+ (see Open Questions). |
| **Competitor response** | Low | Medium | Self-coaching features are hard to copy. Multilingual support gives APAC advantage. |
| **Privacy concerns** | Low | High | Row-level security, data export, transparent privacy policy. Mood data (future) will be extra-sensitive. |
| **User burnout / notification fatigue** | Medium | Medium | No notifications yet. When added, must be opt-in and configurable per habit. |

---

## 13. Go-to-Market

### Pre-Launch

- Beta testing with 50-100 early users
- Gather retention data at Day 3, 7, 14, 30
- Iterate based on feedback
- Prepare marketing materials (Product Hunt, Reddit, content)

### Launch Channels

- Product Hunt submission
- Social media campaign
- Reddit posts (r/productivity, r/getdisciplined, r/selfimprovement)
- Email outreach to habit tracking communities
- APAC-specific outreach leveraging multilingual support

### Partner Outreach

- Coaches and wellness professionals
- Therapists (especially if Mood Check-ins ship)
- Corporate wellness programs

> **CEO Direction Needed:** Launch timeline, marketing budget, and channel priorities. See Open Questions (Section 15).

---

## 14. Product Roadmap

### V2.5 — Next Milestone Candidates

These are options, not commitments. CEO should prioritize based on business goals.

| Feature | Effort | Value | Primary Persona | Notes |
|---------|--------|-------|-----------------|-------|
| **Projects & Kanban** | High | High | Productivity Warrior | Work/Personal separation, project-based task organization, kanban boards. Full spec in Appendix C. **Recommended next build.** |
| **Mood Check-ins** | High | High | Self-Awareness Seeker | Full spec in Appendix A. Quick emotional logging, therapist export, crisis resources. |
| **Habit Templates Library** | Medium | Medium | Consistency Builder | 50+ pre-built habits by category. "Start tracking" one-click setup. |
| **Notifications / Reminders** | Medium | High | All | In-app notification center, habit reminders, streak-at-risk warnings. No spec exists yet — needs design work. |
| **Recurrence description i18n** | Low | Medium | All (non-English) | Recurrence descriptions currently English-only. Refactor needed. |

### V3.0 — Medium-term (Month 2-3)

- Habit-mood correlation ("On days you meditated, stress was 2.1 vs 3.8")
- AI-powered habit suggestions (using collected behavioral data)
- Daily score / Consistency index
- Habit-task linking
- Advanced analytics dashboard
- Journal / reflection entries

### V4.0+ — Vision

- Native iOS + Android apps
- Health data integrations (Apple Health, Google Fit)
- Wearable integration (Oura Ring, Apple Watch)
- Anonymous leaderboards ("Better than 73% of users")
- Coaching integration (connect with real coaches/therapists)
- Goals system (connect habits to larger life outcomes)
- AI trigger identification (ML-based pattern detection in mood notes)

---

## 15. Open Questions for CEO

These are strategic decisions that require executive direction. The product team cannot make these calls alone.

| # | Question | Context |
|---|----------|---------|
| 1 | **What is our monetization model?** | Free forever? Freemium? Subscription? Which features go behind a paywall? |
| 2 | **When do we launch publicly?** | Product is functional. What's the launch timeline and marketing budget? |
| 3 | **Do we build native mobile apps for V3?** | Web works on mobile browsers today. Native apps are 2-3 months of work but unlock push notifications and health integrations. |
| 4 | **Should we pursue Mood Check-ins for V2.5?** | Full spec ready (Appendix A). High value for differentiation but sensitive (mental health data, privacy, crisis handling). |
| 5 | **What's our position on AI features?** | We're collecting behavioral data. When do we invest in AI-powered suggestions? What's the privacy stance? |
| 6 | **Should we pursue social features?** | Leaderboards, shared habits, accountability partners. High engagement potential but risk of toxic comparison. |
| 7 | **What's our target market — English-first or APAC-first?** | Multilingual support gives us an advantage in APAC. Should we lean into it for launch? |
| 8 | **Do we want coaching/therapist partnerships?** | Mood Check-ins + therapist export creates a bridge to professional care. Is this a strategic direction? |
| 9 | **What's the acceptable user data retention policy?** | How long do we keep user data? What's our privacy policy stance? GDPR compliance needed for EU launch? |
| 10 | **What's the team growth plan?** | Currently AI-assisted solo development. When do we hire? What roles first — design, mobile, marketing? |

---

## 16. Out of Scope

These are consciously excluded from the current product.

| Feature | Rationale |
|---------|-----------|
| Mobile app | Web-only; responsive design works on mobile browsers |
| Offline support | Requires significant client-side storage work; revisit based on demand |
| OAuth / social login | Email/password sufficient for now |
| Health data integrations | Requires native mobile apps (Apple Health, Google Fit) |
| Leaderboards / comparison | Social comparison can be toxic; establish individual habits first |
| AI suggestions | Need more behavioral data before personalization is valuable |
| Native notifications | Not yet designed; must be opt-in and configurable when added |
| Workout tracking | Not core to habit tracking; better served by specialized apps |
| Real-time chat | Not relevant to self-improvement tracking |
| Habit-task linking | Deferred — complexity without clear current value |

---

## 17. Related Documents

| Document | Purpose |
|----------|---------|
| `FEATURE_VERTICAL_DEPTH_STRATEGY.md` | Feature PRD: 6 self-coaching features (all shipped) — intention field, task horizon, absence recovery, streak milestones, completion reflection, weekly insights |
| `FEATURE_RECURRING_TASKS.md` | Feature PRD: recurring tasks (shipped) — recurrence patterns, scope editing, generation model |
| `ENGINEERING_PLAN_V1.md` | V1 engineering plan (historical) |
| `ENGINEERING_PLAN_V2.md` | UI design engineering plan (historical) |
| `ENGINEERING_PLAN_V3.md` | Vertical depth engineering plan |
| `UI_DESIGN_V1.md` | UI design spec V1 (historical) |
| `UI_DESIGN_V2.md` | UI design spec V2 (historical) |

For engineering details (database schemas, API specifications, component architecture), see the individual `FEATURE_*.md` and `ENGINEERING_PLAN_*.md` documents.

---

## Appendix A: Mood Check-ins Specification

> **Status:** Not yet built. Included here as a product specification for CEO review and prioritization.

### Overview

Quick capture of emotional states and physical sensations, creating a log that can be reviewed personally or shared with mental health professionals. Designed for real-time emotional capture — when you're feeling anxious with a tight chest, you want to log it in under 30 seconds, not write a journal entry.

**Target Persona:** The Self-Awareness Seeker (Persona 4)

### Product Logic

**Quick Check-in Flow:**

```
How are you feeling right now?

Stress Level:  [1]  [2]  [3]  [4]  [5]
               Calm              Overwhelmed

What's going on? (optional text)

Body sensations (tap to select):
[Tight chest] [Racing heart] [Tense shoulders]
[Headache] [Fatigue] [Restless] [Nausea]
[Shortness of breath] [+ Add custom]

                [Save Check-in]
```

**Design Principles:**
- Under 30 seconds to capture — stress level is required, everything else optional
- Pre-built body sensation tags — faster than typing, consistent for pattern analysis
- No streaks — mental health should not be gamified
- Compassionate tone — "It's okay to not be okay"
- Private by default — data never leaves without explicit user action

### Wireframes

**Dashboard Integration:** Optional "Quick Check-in" button — accessible via navigation, not prominently featured (avoid over-prompting about emotions).

**Check-in Pages:**
- Quick check-in form (optimized for speed)
- History list with date filters
- Trends and patterns visualization (stress over time, common sensations)

### Therapist Export

PDF/CSV report formatted for clinical review:
- Summary: total check-ins, average stress, highest stress day, most common sensation
- Stress distribution chart
- Detailed chronological log with notes and body sensations
- Observed patterns (peak stress times, day-of-week trends, recurring themes)
- Clear disclaimer: "For informational purposes — review with a qualified mental health professional"

### Safety

| Concern | Mitigation |
|---------|-----------|
| Crisis situations | If stress level = 5, display crisis resources (988 Suicide Prevention, Crisis Text Line, international resources) before saving |
| Over-tracking | No streaks, no gamification, no "you haven't checked in" prompts |
| Negative reinforcement | Compassionate copy: "Thank you for checking in with yourself" |
| Professional boundary | Clear disclaimer: "This is not a substitute for professional care" |
| Sensitive data | Data encrypted at rest, strict access controls, no analytics on mood content |
| Accidental sharing | Export requires explicit action + confirmation dialog |

### Success Metrics

| Metric | Target |
|--------|--------|
| Check-ins per user per week | 2-5 (not too many, not too few) |
| Export usage | 10% of check-in users export at least once |
| Feature retention after 2 weeks | 40% of users who try it continue |
| Crisis resource views | Track for safety awareness (no numeric target) |

### Future Enhancements (V3+)

- Habit-mood correlation: "On days you meditated, average stress was 2.1 vs 3.8"
- Trigger identification via pattern detection in notes
- Therapist portal with direct secure sharing
- Guided check-ins: optional prompts like "What triggered this feeling?"
- Voice notes for when typing is too much

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **Streak** | Consecutive scheduled completions of a habit. Counts only days when the habit is scheduled, not calendar days. |
| **Scheduled day** | A day when a habit is due based on its frequency setting (e.g., weekdays-only habits aren't scheduled on weekends). |
| **Completion rate** | Percentage of scheduled days where a habit was completed, over a given time period. |
| **Heatmap** | 30-day calendar visualization showing habit completion patterns (green = done, gray = missed). |
| **Milestone** | A streak threshold (7, 14, 30, 50, 100, 200, 365 days) that triggers a celebration. |
| **Absence recovery** | 3-tier system that shows compassionate messages when a user returns after missing habit days. |
| **Intention** | An optional "Why does this matter?" field on tasks, shown to increase follow-through. |
| **Completion reflection** | Brief inline feedback (Easy/Good/Hard) shown after completing a meaningful task. |
| **Task horizon** | Dashboard section showing tomorrow's tasks, reducing anxiety about what's coming next. |
| **Weekly insight** | One behavioral observation surfaced per week (e.g., "Your best day was Thursday"). |
| **Recurring task** | A task that automatically regenerates on a schedule (daily, weekly, monthly, etc.). |
| **Template** | The recurring task definition that generates individual task instances. |
| **Instance** | A single occurrence of a recurring task, generated from a template. |
| **Scope editing** | Editing a recurring task instance with options: "this only," "this and following," or "all instances." |
| **Section** | Top-level Work or Personal classification that separates professional and personal tasks. |
| **Project** | A named container for related tasks within a section, displayed as a kanban board. |
| **Kanban board** | A visual board with columns (To Do / Done) for organizing tasks within a project. |
| **Standalone task** | A task that doesn't belong to any project — exists directly within a section. |
| **Design token** | A named, semantic CSS variable (e.g., "category-health") that ensures consistent styling across the app. |

---

## Appendix C: Projects & Kanban Specification

> **Status:** Not yet built. Recommended as the V2.5 centerpiece. Included here as a product specification for engineering planning.

### The Problem

BetterR.Me's task system treats all tasks as a flat list. A quick errand ("Buy milk") sits alongside a multi-step work deliverable ("Launch Q1 campaign") with no structural difference. Users who manage both personal and professional responsibilities need two things the current system lacks:

1. **Clear separation between Work and Personal** — so work tasks don't bleed into personal time and vice versa.
2. **Project-level organization** — so related tasks can be grouped, tracked, and managed as a unit.

### Core Concept

Introduce **Projects** as an organizational layer between sections and tasks. The task system gains a two-level hierarchy:

```
Section (Work or Personal)
  └── Project (optional grouping)
       └── Tasks (with kanban positioning)
```

Tasks can still exist without a project (standalone quick tasks). Projects live inside a section. Every task belongs to a section — either inherited from its project or set directly for standalone tasks.

### Work / Personal Separation

The current task categories (Work, Personal, Shopping, Other) are repurposed:

| Current Category | New Section | Notes |
|-----------------|-------------|-------|
| Work | **Work** | Top-level section |
| Personal | **Personal** | Top-level section |
| Shopping | **Personal** | Becomes a category tag within the Personal section |
| Other | **Personal** | Becomes a category tag within the Personal section |

Categories remain as optional sub-labels on individual tasks for finer-grained filtering (e.g., a "Shopping" tag within the Personal section). The key change: **Work and Personal are separated at the structural level**, not just tagged.

### Projects

A project is a named container for related tasks within a section.

| Attribute | Details |
|-----------|---------|
| **Name** | Required. e.g., "Q1 Marketing Campaign", "Kitchen Renovation" |
| **Section** | Work or Personal (required) |
| **Color** | Optional accent color for visual differentiation |
| **Status** | Active or Archived |
| **Sort order** | Position within its section |

**What a project is NOT:**
- Not a folder hierarchy — projects are flat (no sub-projects in V1)
- Not a team feature — projects belong to one user (collaboration is a future concern)
- Not required — standalone tasks are first-class citizens

### Kanban Board

Each project contains a kanban board for visualizing task progress.

**V1 Columns:** To Do | Done

Two columns keep the initial experience simple — essentially a visual task list with drag-and-drop completion. The value is in the visual grouping and spatial organization, not column complexity.

**Future:** Add an "In Progress" middle column once usage patterns confirm users want a three-stage workflow.

**Kanban task cards show:** Title, priority indicator, due date (if set), category tag (if set).

**Adding tasks:** An "Add task" action at the bottom of the To Do column creates a task pre-assigned to this project and section.

**Completing tasks:** Drag a task from To Do to Done, or check it off — same behavior as today, but visually represented in the board.

### The `/tasks` Page

The `/tasks` page becomes the hub for the new model:

**Layout:** Two sections stacked vertically — Work and Personal.

**Within each section:** A card grid where each card is either:
- A **project card** — shows project name, color, task count, completion progress bar. Clicking opens the kanban view.
- A **standalone tasks card** — groups all tasks in that section that don't belong to a project. Displays as a simple task list.

**Project card preview:**

```
┌─────────────────────────────────┐
│  Q1 Marketing Campaign          │
│  3 of 8 tasks done              │
│  ████████░░░░░ 38%              │
└─────────────────────────────────┘
```

### Task Creation Changes

- Task form gains an optional **Project** selector (dropdown grouped by section)
- Task form gains a **Section** selector: Work / Personal (required, defaults to Personal)
- Selecting a project auto-fills the section from the project
- Creating a task from inside a kanban board pre-fills project and section

### What Stays the Same

| Area | Impact |
|------|--------|
| **Dashboard** | No changes. Tasks due today still appear in "Tasks Today" regardless of project or section. |
| **Sidebar** | No changes. |
| **Recurring tasks** | Continue to work. Recurring task instances can optionally belong to a project. |
| **Standalone tasks** | Fully supported. No project required. |
| **All existing task features** | Priority, intention, reflection, horizon, categories — all work on project tasks. |

### Migration Path

Existing tasks receive `section = personal` as a safe default. No data loss, no behavioral change for existing users until they create their first project.

### Success Metrics

| Metric | Target |
|--------|--------|
| Project adoption | 30%+ of active users create at least 1 project within 2 weeks |
| Work/Personal separation usage | 20%+ of users have tasks in both sections |
| Kanban engagement | Users with projects complete tasks at same or higher rate than standalone |
| Task organization satisfaction | Qualitative — users report feeling more organized (survey/feedback) |

### Future Enhancements (Deferred)

- **In Progress column** — third kanban column for active work
- **Project-level analytics** — completion velocity, burndown-style progress
- **Project templates** — pre-built project structures ("Sprint Planning", "Event Planning")
- **Shared projects** — collaboration, assigned tasks (requires multi-user infrastructure)
- **Sub-projects** — hierarchical project nesting
- **Project archiving with history** — completed projects preserved for review

---

**Document Version:** 2.0 (Consolidated Master PRD)
**Last Updated:** February 18, 2026
**Status:** Living Document — updated as features ship
