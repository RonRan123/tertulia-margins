# Principles We Borrowed

Where each rule in this repo comes from, so it can be questioned instead of followed blindly. Read once; CLAUDE.md holds the enforceable version.

| Principle | Source | Where it lives here |
|---|---|---|
| Write the design doc for yourself first; frame decisions as trade-offs; one idea per paragraph; anticipate objections; push details to appendices; cut ~30% | Grant Slatton, *How to design a document* | DESIGN.md structure, "Objection:" notes, appendices |
| Reduce load beyond what the problem demands: deep modules, early returns, named conditions, no inheritance, framework as library, few choices, string error codes | Zakirullin, *Cognitive load* | CLAUDE.md "Code style"; `core/` with no framework imports |
| Give the agent a check it can run; explore → plan → code → commit; keep CLAUDE.md short; `/clear` between tasks; restart after two failed corrections | Claude Code best practices | `/step` skill (verify + evidence), CLAUDE.md length, two-attempt rule |
| A sprint is a pipeline of roles (think → plan → build → review → ship → reflect), each knowing when to stop | Garry Tan, gstack | `/decide` (think) → `/step` (plan/build/verify) → `/explain` (review) → `/wrap` (reflect) |
| Implement to learn; document intent; keep specs in sync; invest in end-to-end tests; code is cheap, maintenance isn't | Breunig, *10 lessons for agentic coding* | DECISIONS.md (intent), "update docs in the same change", eval script |
| Spec-first; a memory bank so each session resumes cold | Tweag, *Agentic coding handbook* | DESIGN.md + PLAN.md + DECISIONS.md act as the memory bank |
| Plan in markdown; defer hard features to a separate section; one feature at a time; commit each working section; reset rather than stack bad attempts | YC, *Guide to vibe coding* | PLAN.md parking lot, one step = one commit, clean-tree rule |
| Think before coding (state assumptions, ask); simplicity first; surgical changes; goal-driven execution with success criteria | Karpathy-style CLAUDE.md | CLAUDE.md working agreement; "done when" in every step |

## The driver's-seat contract, in one paragraph

Claude can write most of the code; Ronith must be able to explain all of it. So decisions are surfaced (`/decide`) and logged (DECISIONS.md). The prompts, which carry the product's judgment, are Ronith's to write. Every step ends with evidence and a short explanation, and `/explain` quizzes rather than lectures.
