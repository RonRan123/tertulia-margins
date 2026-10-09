# Build Plan

Living tracker. Claude updates checkboxes as steps are **verified** (not just written). One step = one commit.
Each step has a **Verify** line: the check that proves it works.

Time log: record actual hours in the table at the bottom. It feeds the write-up.

---

## Day 0: Homework (before any code; not counted in the 21 h)
- [ ] 30-min manual test: paste one annotated chapter + your notes into Claude, have the conversation you wish the tool had. Save in `docs/research/day0.md`.
- [ ] ≤1 h: try NotebookLM and Readwise Reader on the same chapter. List what each does badly.
- [x] Answer DESIGN.md open questions Q1, Q2, Q4, Q6. (D5, D7, D9, D10)
- **Verify:** `docs/research/day0.md` has a draft system prompt and a "what competitors get wrong" list.

## Days 1–2: v0, grounded conversation
- [ ] Scaffold Next.js + TS, lint, test runner. **Verify:** `npm run build` and `npm test` pass.
- [ ] `core/converse` streams a reply for a passage + question. **Verify:** script prints streamed tokens and TTFT.
- [ ] Paragraph IDs + cite-or-abstain prompt (Ronith writes `prompts/system.md`). **Verify:** 3 hand questions answered with `[¶n]`.
- [ ] PDF upload: extract text into paragraphs with printed-page (else PDF-page) labels (D8; needs Ronith's OK on the PDF library). **Verify:** a chapter PDF yields paragraphs whose page labels match the book.
- [ ] `checkCitations`. **Verify:** unit tests: real quote passes, invented quote fails.
- [ ] Minimal page: paste box + chat. **Verify:** screenshot of a grounded streamed reply.

## Days 3–4: v1, the MVP (notes + `/define` + `/quiz`)
*MVP = the minimal loop plus `/quiz` (D11). One model for everything; pick it with `/decide` at scaffold time.*
- [ ] Two-pane layout; notes always in context; AI text only in the chat pane (D6).
- [ ] Persist passage + notes in localStorage behind a `store` module (D7). **Verify:** reload keeps state.
- [ ] Command table + `/define` (app pastes the verbatim sentence, D6) and `/quiz` on selection. **Verify:** each command end-to-end in browser.
- [ ] Export to markdown (the D7 safety net). **Verify:** file opens cleanly in Obsidian.
- **Cut-line check (end of day 4):** if the MVP is not done, drop everything after it except the write-up.

## Day 5: v2, after the MVP (priority order; what doesn't fit goes to the parking lot)
- [ ] Prompt caching on the passage prefix; log model, tokens and latency per call. **Verify:** usage shows cache read on turn 2; TTFT before/after recorded.
- [ ] `/expand` on selection.
- [ ] Augment button: proposed expansion shown in chat; nothing is written to the notes (D6).
- [ ] Flag notes that disagree with the passage.
- [ ] Model routing per command (Q3).
- [ ] Public demo deploy, bring-your-own API key (D9, ~1 h): bundled public-domain sample, key never stored or logged server-side. **Verify:** a fresh browser with a pasted key runs a grounded conversation on the sample.

## Day 6: v3, book-level memory (stretch)
- [ ] `/decide` long-context vs retrieval (Q5) using a measurement.
- [ ] Implement chosen approach. **Verify:** question answerable only from another chapter is answered with a correct cite.

## Day 7: v4, tensions, evals, write-up (stretch)
- [ ] `/tensions` over one book.
- [ ] Eval script (DESIGN.md §7). **Verify:** prints a scorecard.
- [ ] Cost-per-session readout in UI.
- [ ] Write-up for LLM engineers (D10): product-story paragraph and screenshots first, then citation validity, cost per session, TTFT cached vs uncached, and design trade-offs.

---

## Parking lot (ideas that are NOT in scope; write here instead of building)
- EPUB upload; photo + OCR
- Tensions across multiple books
- Obsidian plugin / two-way sync
- Open and save a vault `.md` file via the File System Access API (Chromium only; D7 revisit option, ~+0.5-1 h)
- Quiz depth (difficulty levels, "explain this answer"), mindmap, flashcards, Merriam-Webster API (Day 0 notes)
- Goodreads/Reddit counterpoints; book-club personas; user-picked models and difficulty-based routing
- Labelled, opt-in outside knowledge in a separate uncited block (D5; post-MVP)

## Time log
| Day | Planned h | Actual h | Shipped | Notes |
|---|---|---|---|---|
| 1 | 3 | | | |
