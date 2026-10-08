---
name: step
description: Execute the next unchecked step in docs/PLAN.md with plan, approval, implement, verify, explain. Use when Ronith says "next step", "let's build", or invokes /step.
disable-model-invocation: true
---

Target: $ARGUMENTS (if empty, the first unchecked step in docs/PLAN.md)

1. **Confirm clean start.** `git status` must be clean. If not, ask how to proceed.
2. **Plan (no code yet).** Give Ronith:
   - the step and its **done-when** check (from PLAN.md's Verify line, sharpened if vague)
   - files you will create or touch
   - assumptions you are making
   - any decision hiding inside the step → run the `/decide` flow for it first
   Wait for approval.
3. **Implement.** Minimum code for this step only. Follow CLAUDE.md code style. Ideas outside scope go to PLAN.md "Parking lot".
4. **Verify.** Run the check. Show the evidence (command + output, or screenshot). Iterate until it passes. If two fix attempts fail, stop and report what you learned.
5. **Explain.** ≤5 bullets: what changed, why it's shaped this way, and the one thing in the code most worth Ronith reading (with `file:line`).
6. **Close.** Tick the PLAN.md checkbox, update DESIGN.md if reality diverged, and propose a commit message. Commit only after Ronith says yes.
