---
name: capture-lesson
description: Record a lesson in LESSONS.md after a mistake, surprise, failed approach, or human correction, and promote repeated lessons into AGENTS.md rules. Use at the end of any task where something non-obvious was learned, or when the user says "remember this", "note that", or corrects you.
---

# Capture a lesson

1. Read `LESSONS.md` and check whether this lesson (or something close) already exists.
   - **Exists and active:** this is the 2nd occurrence, so promote it (step 3).
   - **New:** add it (step 2).
2. Add a new entry at the **top of the Log**, in the exact format shown in `LESSONS.md`. Write it as a rule someone else can follow, in under 5 lines. Don't include secrets, personal info, or user location.
3. **Promote:** add a concise rule to the right section of `AGENTS.md` and change the lesson's status to `promoted (→ AGENTS.md <section>)`. Keep AGENTS.md short; merge the new rule with an existing one where you can.
4. If a lesson is wrong or outdated, set it to `obsolete` with a one-line reason. Don't delete it.
5. Tell the human which lesson you added or promoted, in one line.

Lessons from contributors arrive through PRs like any other change, so maintainers review them.
