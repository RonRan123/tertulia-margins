---
name: wrap
description: End-of-session wrap-up. Updates the plan and time log and captures write-up material. Use when Ronith says he's done for the day or invokes /wrap.
disable-model-invocation: true
---

1. **Status.** Read docs/PLAN.md and `git log` since the session started. List what was shipped (verified) vs started vs not touched.
2. **Time log.** Ask Ronith for actual hours, then fill the PLAN.md time-log row.
3. **Cut-line check.** Compare progress to the plan. If behind, say so plainly and propose what to cut, per DESIGN.md §8. Ronith decides.
4. **Write-up material.** Append to docs/writeup-notes.md (create if missing): any measured numbers (TTFT, cost, eval scores, with date and model), surprising findings, and screenshot paths. Numbers only if actually measured.
5. **Next session.** One line: the first step for next time and anything Ronith should think about before then (e.g. an open question in DESIGN.md §10).
6. **Doc drift.** Flag any place where DESIGN.md no longer matches the code.
