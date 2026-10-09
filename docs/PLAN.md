# Build Plan

Living tracker. Claude updates checkboxes as steps are **verified** (not just written). One step = one commit.
Each step has a **Verify** line: the check that proves it works.

Time log: record actual hours in the table at the bottom. It feeds the write-up.

---

## Day 0: Homework (before any code; not counted in the 21 h)
- [x] 30-min manual test: paste one annotated chapter + your notes into Claude, have the conversation you wish the tool had. Save in `docs/research/day0.md`.
- [x] ≤1 h: try NotebookLM and Readwise Reader on the same chapter. List what each does badly.
- [x] Answer DESIGN.md open questions Q1, Q2, Q4, Q6. (D5, D7, D9, D10)
- **Verify:** `docs/research/day0.md` has a draft system prompt and a "what competitors get wrong" list.

## MVP scope contract (D11)

**The MVP is done when:** you can load a chapter PDF (or paste), write notes beside it, chat with the AI about it with every claim cited as `[¶n]` (page shown), run `/define` and `/quiz` on a selection, reload without losing anything, and export the notes to Obsidian. Used end to end on a real chapter of your own book.

| IN the MVP | OUT (after the MVP or parked) |
|---|---|
| PDF upload with page labels, paste fallback (D8) | Prompt caching, cost/TTFT logging (Sprint 5) |
| Grounded chat, cite-or-abstain, `checkCitations` | `/expand`, Augment, disagreement flags (Sprint 5) |
| Two panes; notes always in context; AI text only in chat (D6) | Model routing; the MVP uses one model (Sprint 5) |
| `/define` (app pastes the verbatim sentence) and `/quiz` | Public demo (Sprint 5) |
| localStorage + markdown export (D7) | Book-level memory, `/tensions`, evals (Sprints 6-7) |
| | Everything in the Parking lot |

**Rules that stop scope creep**
- A sprint ends when its **Demo** check passes. Unfinished tasks do not roll silently into the next sprint; decide to cut or to swap.
- Adding anything to the MVP column needs a `/decide`, and something of equal size comes out (swap, don't add).
- Over the time box by more than 30 minutes: stop and say what is being cut.
- New idea mid-sprint: Parking lot, not code.
- **MVP gate (end of Sprint 4):** if the MVP is not done, drop everything after it except the write-up.

Hours below are my estimates against the 3 h/day budget; adjust them if reality disagrees.

## Sprint 1 (Day 1, 3 h): skeleton + grounded reply
**Goal:** a script asks a question about a passage and streams back a cited, checked answer.
- [x] Scaffold Next.js + TS, lint, Vitest (no Tailwind). **Verify:** `npm run build` and `npm test` pass.
- [x] `core/converse` streams a reply for a passage + question. **Verify:** script prints streamed tokens and TTFT.
- [x] Paragraph IDs + cite-or-abstain prompt (`prompts/system.md`, already drafted). **Verify:** 3 hand questions answered with `[¶n]`.
- [x] `checkCitations`. **Verify:** unit tests: real quote passes, invented quote fails.
- **Demo:** the script's output for the 3 questions, with the citation check green.

## Sprint 2 (Day 2, 3 h): input + first page
**Goal:** a chapter from a real PDF produces a grounded streamed reply in the browser.
- [ ] PDF upload: paragraphs with printed-page (else PDF-page) labels (D8; ask before installing the PDF library). **Verify:** a chapter PDF yields paragraphs whose page labels match the book.
- [ ] Minimal page: upload/paste box + chat, page shown beside each `[¶n]`. **Verify:** screenshot of a grounded streamed reply.
- **Demo:** the screenshot, from your own book.
- **Risk:** printed-page detection. If it eats more than 1 h, fall back to PDF pages only (D8 revisit).

## Sprint 3 (Day 3, 3 h): notes
**Goal:** the product has its second pane and survives a reload.
- [ ] Two-pane layout; notes always in context; AI text only in the chat pane (D6).
- [ ] Persist passage + notes in localStorage behind a `store` module (D7). **Verify:** reload keeps state.
- **Demo:** write notes, ask a question that visibly uses them, reload, nothing lost.

## Sprint 4 (Day 4, 3 h): commands + export (MVP gate)
**Goal:** the MVP definition above is true.
- [ ] Command table + `/define` (app pastes the verbatim sentence with `[¶n]`/page, D6) and `/quiz` on selection. **Verify:** each command end to end in the browser.
- [ ] Export to markdown. **Verify:** file opens cleanly in Obsidian.
- [ ] Use it on a real chapter and write down what felt wrong (feeds Sprint 5 priorities).
- **MVP gate:** done, or cut everything after it except the write-up.

## Sprint 5 (Day 5, 3 h): after the MVP (priority order; what doesn't fit goes to the Parking lot)
- [ ] Prompt caching on the passage prefix; log model, tokens and latency per call. **Verify:** cache read on turn 2; TTFT before/after recorded.
- [ ] `/expand` on selection.
- [ ] Augment: proposed expansion shown in chat; nothing written to the notes (D6).
- [ ] Flag notes that disagree with the passage.
- [ ] Model routing per command (Q3).
- [ ] Public demo deploy, bring-your-own API key (D9, ~1 h): bundled public-domain sample, key never stored or logged server-side. **Verify:** a fresh browser with a pasted key runs a grounded conversation on the sample.

## Sprint 6 (Day 6, 3 h): book-level memory (stretch)
- [ ] `/decide` long-context vs retrieval (Q5) using a measurement.
- [ ] Implement chosen approach. **Verify:** question answerable only from another chapter is answered with a correct cite.

## Sprint 7 (Day 7, 3 h): tensions, evals, write-up (stretch)
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
| 2 | 3 | | | |
| 3 | 3 | | | |
| 4 | 3 | | | MVP gate |
