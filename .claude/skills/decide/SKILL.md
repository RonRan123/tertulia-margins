---
name: decide
description: Frame a product or architecture decision for Ronith to make, then log it in docs/DECISIONS.md. Use whenever a choice about product behavior, architecture, dependencies, data model, model selection, or prompt content comes up, instead of choosing silently.
---

Decision topic: $ARGUMENTS

1. **Context.** In 2–3 sentences: what forces this decision now, and which DESIGN.md section or open question (Qn) it touches. Read docs/DECISIONS.md first; if a past decision applies, say so.
2. **Options.** 2–4 real options (no strawmen). For each: one-line description, what it costs in hours (against the 21 h budget), what it makes easier or harder later, and what Ronith would learn from it.
3. **Recommendation.** Pick one and give the single deciding trade-off. Name the strongest objection to your pick and answer it.
4. **Ask.** Use AskUserQuestion with the recommended option first. Do not proceed until Ronith answers.
5. **Log.** Append an entry to docs/DECISIONS.md using the template there (status `Accepted` or `Provisional`, today's date, "Ronith"). Resolve the matching Qn in DESIGN.md and update any section the decision changes.

Keep the whole framing short enough to read in under a minute.
