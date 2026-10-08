# Build Plan

Living tracker. Claude updates checkboxes as steps are **verified** (not just written). One step = one commit.
Each step has a **Verify** line: the check that proves it works.

Time log: record actual hours in the table at the bottom. It feeds the write-up.

---

## Day 0: Homework (before any code; not counted in the 21 h)
- [ ] 30-min manual test: paste one annotated chapter + your notes into Claude, have the conversation you wish the tool had. Save in `docs/research/day0.md`.
- [ ] ≤1 h: try NotebookLM and Readwise Reader on the same chapter. List what each does badly.
- [ ] Answer DESIGN.md open questions Q1, Q2, Q4, Q6.
- **Verify:** `docs/research/day0.md` has a draft system prompt and a "what competitors get wrong" list.

## Days 1–2: v0, grounded conversation
- [ ] Scaffold Next.js + TS, lint, test runner. **Verify:** `npm run build` and `npm test` pass.
- [ ] `core/converse` streams a reply for a passage + question. **Verify:** script prints streamed tokens and TTFT.
- [ ] Paragraph IDs + cite-or-abstain prompt (Ronith writes `prompts/system.md`). **Verify:** 3 hand questions answered with `[¶n]`.
- [ ] `checkCitations`. **Verify:** unit tests: real quote passes, invented quote fails.
- [ ] Minimal page: paste box + chat. **Verify:** screenshot of a grounded streamed reply.
- [ ] Prompt caching on passage prefix. **Verify:** usage shows cache read on turn 2; TTFT before/after recorded.

## Days 3–4: v1, notes + commands
- [ ] Two-pane layout; notes always in context; AI text visually distinct.
- [ ] Persist passage + notes (per Q1 decision). **Verify:** reload keeps state.
- [ ] Command table + `/define` `/quiz` `/expand` on selection. **Verify:** each command end-to-end in browser.
- [ ] Model routing per command; log model, tokens, latency per call.
- **Cut-line check (end of day 4):** if v1 is not done, drop v3 and v4.

## Day 5: v2, augmentation (complete product)
- [ ] Augment button: proposed expansion beneath the note; accept / edit / discard.
- [ ] Flag notes that disagree with the passage.
- [ ] Export to markdown. **Verify:** file opens cleanly in Obsidian.

## Day 6: v3, book-level memory (stretch)
- [ ] `/decide` long-context vs retrieval (Q5) using a measurement.
- [ ] Implement chosen approach. **Verify:** question answerable only from another chapter is answered with a correct cite.

## Day 7: v4, tensions, evals, write-up (stretch)
- [ ] `/tensions` over one book.
- [ ] Eval script (DESIGN.md §7). **Verify:** prints a scorecard.
- [ ] Cost-per-session readout in UI.
- [ ] Write-up with screenshots and measured numbers.

---

## Parking lot (ideas that are NOT in scope; write here instead of building)
- EPUB upload; photo + OCR
- Tensions across multiple books
- Obsidian plugin / two-way sync

## Time log
| Day | Planned h | Actual h | Shipped | Notes |
|---|---|---|---|---|
| 1 | 3 | | | |
