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

**The MVP is done when:** you can type or paste reference text from your book (with `[p. N]` page markers) or import it from a PDF, write notes beside it, chat with the AI about it with every claim cited as `[¶n]` (page shown), run `/define` and `/quiz` on a selection, reload without losing anything, and export the notes to Obsidian. Used end to end on a real chapter of your own book.

| IN the MVP | OUT (after the MVP or parked) |
|---|---|
| Reference text typed/pasted with `[p. N]` markers; PDF import as a secondary input (D13) | Prompt caching, cost/TTFT logging (Sprint 5) |
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
**Goal:** reference text from your own book produces a grounded streamed reply in the browser, with page labels.
- [x] Reference text with `[p. N]` markers: paragraphs labelled with the page of the last marker before them (D13). **Verify:** unit tests: markers stripped from the text, labels correct, a paragraph spanning a marker gets a page range.
- [x] PDF import (secondary, `pdfjs-dist`, runs in the browser): extracts text, infers paragraphs, fills the reference-text box with `[PDF p. N]` markers for you to trim (D13). **Verify:** your PDF imports with paragraph breaks that match the book on a hand-checked page.
- [x] Minimal page: reference-text box + chat (multi-turn), page shown beside each `[¶n]`, failed citations flagged. **Verify:** screenshot of a grounded streamed reply.
- **Demo:** the screenshot, from your own book.
- **Risk:** paragraph detection from the PDF. If it eats more than 1 h, ship one paragraph per PDF page and note it.

## Sprint 3 (Day 3, 3 h): notes
**Goal:** the product has its second pane and survives a reload.
- [x] Two-pane layout: notes | chat. Reference text lives in the background: editable on demand, never shown as a reading pane (D14). Notes always in context; AI text only in the chat pane (D6).
- [x] Persist reference text, notes and chat in localStorage behind a `store` module (D7). **Verify:** reload keeps state.
- **Demo:** write notes, ask a question that visibly uses them, reload, nothing lost.

## Sprint 4 (Day 4, 3 h): commands + export (MVP gate)
**Goal:** the MVP definition above is true.
- [x] Command table + `/define` (app pastes the verbatim sentence with `[¶n]`/page, D6) and `/quiz` on selection. **Verify:** each command end to end in the browser.
- [ ] Export to markdown. **Verify:** file opens cleanly in Obsidian. *Built and tested (`993eb40`); Obsidian check deprioritized by D18.*
- [ ] Use it on a real chapter and write down what felt wrong (feeds Sprint 5 priorities).
- **MVP gate:** superseded by D18 (Ronith: "this project is not ready"); the marginalia milestone below replaces it.

## Sprint 5 (Day 5, 3 h): marginalia (D18)
**Goal:** the AI collaborates in the margin instead of a chat pane.
- [ ] Layout: notes | margin column; chat collapses into a drawer (still available). D6 as amended by D18: AI text only in the margin or chat, visually distinct, never in the notes.
- [ ] React: a button acts on the selection or the paragraph at the cursor; one reaction (probing question, pushback cited `[¶n]`, or connection to another passage) appears in the margin, anchored to that excerpt. `prompts/react.md` drafted by Claude (D19); Ronith refines it in Sprint 7. **Verify:** three reactions on a real chapter, each of a different kind, citations checked.
- [ ] Threads: reply to a reaction; the AI answers in that thread. Reactions and threads persist across reload (store). **Verify:** reply, reload, thread intact.
- **Demo:** write notes, React on three passages, reply to one, reload.

## Sprint 6 (Day 6, 3 h): blocks + visual redesign (D18)
**Goal:** notes read like Obsidian; the page looks intentional.
- [ ] Notes become Jupyter-style blocks: every block rendered with `marked`, the block being edited shows raw markdown. Existing notes split into blocks on load; export still produces the same file. **Verify:** headings, lists, quotes, bold and links render; editing a block and clicking away re-renders it; reload keeps everything.
- [ ] Reactions anchor to blocks (a block's reactions sit beside it); Define/Quiz/React act on the current block or selection.
- [ ] Visual redesign of notes, margin and drawer (typography, spacing, AI-vs-user distinction). **Verify:** before/after screenshots.

## Sprint 7 (Day 7, 3 h): measure + write-up
- [ ] Ronith reviews and refines every prompt, including the ones Claude drafted in Sprints 5–6 (D19). **Verify:** each prompt file's owner comment says reviewed.
- [ ] Prompt caching on the passage prefix; log model, tokens and latency per call. **Verify:** cache read on turn 2; TTFT before/after recorded.
- [ ] Eval script (DESIGN.md §7), including reaction quality spot-checks. **Verify:** prints a scorecard.
- [ ] Write-up for LLM engineers (D10): product-story paragraph and screenshots first, then citation validity, cost per session, TTFT cached vs uncached, and design trade-offs.

---

## Parking lot (ideas that are NOT in scope; write here instead of building)
- EPUB upload; photo + OCR
- Tensions across multiple books
- Obsidian plugin / two-way sync
- Open and save a vault `.md` file via the File System Access API (Chromium only; D7 revisit option, ~+0.5-1 h)
- Quiz depth (difficulty levels, "explain this answer"), mindmap, flashcards, Merriam-Webster API (Day 0 notes)
- Goodreads/Reddit counterpoints; book-club personas; user-picked models and difficulty-based routing
- Reference text edited mid-conversation renumbers paragraphs, so earlier `[¶n]` in the chat history can point at different text (D15 note; ignored for the MVP)
- Quotes the AI takes from the reader's notes are flagged `citation_missing` by `checkCitations` (Sprint 3 test; Ronith: leave it for now). Option later: pass notes to the check and exempt verbatim note quotes. Sprint 4 QA: 3 of 4 `/define`/`/quiz` replies showed such false warnings (also `quote_not_in_paragraph` when the model put a `[¶n]` beside a note quote), so commands make this common. Options: a prompt rule, or the checker exemption
- `checkCitations` recognises `[¶n]` and `[¶n-m]` only; the app's `/define` quotes read `[¶4, p. 12]`, so a reply copying that shape would be flagged `citation_missing` (not seen in QA yet)
- `/quiz` prompt doesn't mention the `<selection>` block; the model infers scope from it (QA: worked). Ronith may want a line in `prompts/quiz.md`
- Define: the quote is inserted with no undo (Cmd+Z); running Define twice on the same word inserts the quote twice; the status line is truncated at phone width with no tooltip
- Export: notes that start with their own `---` frontmatter get a second block (Obsidian shows it as a rule); the page range uses first/last label in order, so out-of-order markers read "p. 5 to p. 4"
- Route size caps (passage length, turns): needed before the public demo (Sprint 5, D9)
- Labelled, opt-in outside knowledge in a separate uncited block (D5; post-MVP)
- ~~UX redesign: marginalia-first~~ → scheduled by D18 (Sprints 5–6)
- Smarter margin trigger (Ronith, D18): instead of a per-block button, reactions that thread and connect across blocks, or a periodic pass over all notes and thoughts. "Every block seems forced and overwhelming."
- Commands typed inside a block, Jupyter-style (`/quiz`, `/define` run from the notes; Ronith, D18). Needs a D6 check: where the AI's answer lands
- Moved out by D18: `/expand` on selection; model routing per command (Q3); book-level memory (Q5: long-context vs retrieval); `/tensions` over one book; cost-per-session readout in the UI
- Public demo deploy, bring-your-own API key (D9, ~1 h); needs the route size caps above (moved out by D18)
  - Open questions for the `/decide`: (a) D6 says AI text lives only in the chat pane, so margin comments need a visibly distinct AI-only area that never edits notes, and the invariant needs restating; (b) trigger and cost (on pause, per paragraph, on a button?), since auto-calls multiply spend and interact with caching (Sprint 5); (c) probing questions vs. grounded claims: do they need `[¶n]` citations and `checkCitations`?; (d) how this relates to Augment and disagreement flags (Sprint 5), which may fold into it; (e) whether it replaces `/define` and `/quiz` in Sprint 4 or sits beside them.

## Time log
| Day | Planned h | Actual h | Shipped | Notes |
|---|---|---|---|---|
| 1 | 3 | | | |
| 2 | 3 | | | |
| 3 | 3 | | | |
| 4 | 3 | | | MVP gate |
