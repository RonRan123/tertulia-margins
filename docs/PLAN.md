# Build Plan

Living tracker. Claude updates checkboxes as steps are **verified** (not just written). One step = one commit.
Each step has a **Verify** line: the check that proves it works.

Time log: record actual hours in the table at the bottom. It feeds the write-up.

v1's plan (Sprints 1–6, MVP contract, scope rules) is frozen in [archive/v1/PLAN.md](archive/v1/PLAN.md) (D21). The scope rules below carry over.

**Rules that stop scope creep (from v1)**
- A step ends when its **Verify** check passes. Unfinished tasks do not roll silently into the next step; decide to cut or to swap.
- New idea mid-step: Parking lot, not code.
- Over the time box by more than 30 minutes: stop and say what is being cut.

---

## v1 (Sprints 1–6): done, archived
Full checklist with Verify lines and QA notes: [archive/v1/PLAN.md](archive/v1/PLAN.md); code at tag `v1-marginalia`.
Shipped: grounded chat with `[¶n]` + `checkCitations` (S1–2), notes + persistence (S3), `/define` `/quiz` + export (S4), margin reactions as threads (S5), notes as blocks + visual pass (S6).
Left open in v1: Obsidian check on export, real-chapter use notes (S4). Sprint 7 moved below, after the overhaul (D21).

## v2 overhaul (D21–D23)
**Goal:** one place per book: folders in a sidebar, notes in the centre, and a right pane that shows the margin, the PDF or the chat, picked from a view switcher. Input: Ronith's insights in [research/v2-insights.md](research/v2-insights.md).
**Time box:** _Ronith to set (Q11)._ Over by 30 min on a step: stop and say what is cut.

### R1: layout shell + view switcher (one book still)
- [x] Grid: collapsible sidebar (1/6, open/close button), notes (3/6), right pane (2/6). The sidebar shows the current book as a placeholder entry until R2.
- [x] View switcher at the top, two groups: *Beside notes* (Margin · PDF · Chat in the right pane) and *Alone* (Notes · PDF · Chat filling the space). The chat drawer goes; chat becomes a view. PDF view shows an empty state until R3.
- [x] Reference-text editor and PDF import move from the header to the book entry in the sidebar.
- *Decided (D22):* "only" views fill the space beside the sidebar; view and sidebar state remembered across reloads; phones: sidebar overlay, one pane at a time.
- **Verify:** each view switches without losing notes, a streaming reply or a margin thread; sidebar toggles; `npm test` and `npm run build` pass; screenshots of all views. *Done (headless Chrome, public-domain text): all six views and phone captured; a chat reply asked in Notes with chat kept streaming while Notes only was shown, finished, showed the unread dot, and was intact on return; view and closed sidebar survived reload; 124 tests, lint, build green.*

- [x] *R1b (D24):* Define and Quiz removed from the toolbar and chat; core command code and prompts kept. **Verify:** 124 tests, lint, build green.

### R2: books as folders
- [ ] Data model: a list of books, each with its own reference text, notes, chat and reactions; the sidebar lists books, adds, renames and switches. v1's stored state becomes the first book (no data lost). **Decide first:** Q9.
- [ ] IndexedDB wrapper (~40 lines, no dependency; D23) for PDFs, keyed by book. **Verify:** unit tests with a fake; two books keep separate notes across reload; v1 data appears as book 1.

### R3: PDF view + upload or URL
- [ ] Add a book's PDF by upload or URL; it is stored (R2) and its text fills the reference text via the existing import (D13). **Decide first:** Q8 (URL fetching).
- [ ] PDF view: browser viewer in an iframe on a `blob:` URL; clicking a `[p. N]` cite (or a `[¶n]` with a page label) opens the PDF view at that page (D23). **Verify:** a cite opens the right PDF page in Chrome and Safari; the PDF survives reload.

### R4+ (not scheduled): grounded linking
- [ ] Link a cite to the actual text, not just its page: regex for the quoted words around the cited page(s), then AI as a fallback (Ronith's "future iteration"). **Decide first:** Q10.

## Sprint 7: measure + write-up (after v2, D21)
- [ ] Ronith reviews and refines every prompt, including the ones Claude drafted in Sprints 5–6 (D19). **Verify:** each prompt file's owner comment says reviewed.
- [ ] Prompt caching on the passage prefix; log model, tokens and latency per call. **Verify:** cache read on turn 2; TTFT before/after recorded.
- [ ] Eval script (DESIGN.md §7), including reaction quality spot-checks. **Verify:** prints a scorecard.
- [ ] Write-up for LLM engineers (D10): product-story paragraph and screenshots first, then citation validity, cost per session, TTFT cached vs uncached, and design trade-offs; v1 → v2 as the design story.

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
- Sprint 6 QA: a block's caret always opens at the end (clicking mid-sentence doesn't place it there); `checkCitations` flags the AI quoting the reader's notes next to a `[¶n]` (prompts now forbid it, unmeasured); a collapsed card with no replies shows a lone "· Show all"; only http(s)/mailto/relative links stay clickable, so `obsidian://` links render as text
- Sprint 5 QA: "Not in the text" (system.md's wording) appears capitalised mid-sentence ("Whether he'll go is Not in the text here."), Ronith's prompt; React on a paragraph that has a Define quote pasted under it sends the quote line in the excerpt; the router call's tokens aren't in `stats` (Sprint 7 cost logging must add them); at 48–84rem Define/Quiz don't auto-open the drawer (unread dot instead) because it would cover the margin
- Define: the quote is inserted with no undo (Cmd+Z); running Define twice on the same word inserts the quote twice; the status line is truncated at phone width with no tooltip
- Export: notes that start with their own `---` frontmatter get a second block (Obsidian shows it as a rule); the page range uses first/last label in order, so out-of-order markers read "p. 5 to p. 4"
- Route size caps (passage length, turns): needed before the public demo (Sprint 5, D9)
- Labelled, opt-in outside knowledge in a separate uncited block (D5; post-MVP)
- ~~UX redesign: marginalia-first~~ → scheduled by D18 (Sprints 5–6)
- Per-book page offset so PDF pages map to the paper book's pages (Q10 option)
- Highlight the cited text on the PDF page (needs pdfjs rendering instead of the built-in viewer; D23 revisit)
- Bring back Define/Quiz with behaviour Ronith likes (D24): where the reply lands, and whether Define pastes a quote
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
| R1 | | | | v2 layout shell |
| R2 | | | | books as folders |
| R3 | | | | PDF view |
