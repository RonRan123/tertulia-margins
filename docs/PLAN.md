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

- [x] *R1c (D25):* notes become one CodeMirror editor with Obsidian-style live preview; blocks retired; margin cards level with their paragraph. **Verify:** headless Chrome on public-domain text: symbols hidden off the active line and shown on it; typing saves; Cmd+Z restores the exact text; React on a list paragraph streamed a cited reaction into a new card; first card's top = its line's top (195px); reload keeps notes byte-identical and all cards; 112 tests (block-editing and HTML-rendering tests removed with their code), lint, build green.
- [x] *R1d (D26, D27):* quiet chrome and Obsidian fonts: one bar (☰ · book · status · Margin PDF Chat · ⤢ · React); Reference text and Export under the book in the sidebar; one background; hairline margin rule; card excerpts without markdown symbols; system font 16px/1.5, 700px column, Obsidian heading scale. **Verify:** headless Chrome: all six views reached through the switcher and ⤢ (notes+margin, notes+pdf, notes+chat, chat, notes, back); computed editor font is the system stack at 16px/24px; every header and sidebar control is a focusable button; phone screenshot; 112 tests, lint, build green.

- [x] *R1e (D28, D30):* light theme by default (white, light gray, light blue), dark behind a sun/moon toggle, remembered; top bar of icon + label toggles (light-blue pill when selected); icons inline after Lucide. **Verify:** headless Chrome: light and dark screenshots of margin, PDF and chat views; dark chosen, page reloaded, `data-theme` still dark; phone hides the labels; 112 tests (UI-state tests cover the theme), lint, build green.

### R2: books as folders (D31)
- [x] Data model: a library (`tertulia-margins:library`: books and the open one) plus one key per book in v1's shape; v1's stored state is copied into "My first book" and the v1 key kept as a backup. **Verify:** 6 new store tests: migration, no-v1 start, corrupt library without overwriting a saved first book, malformed/duplicate books dropped, add/rename/delete rules, per-book keys; 118 tests, lint, build green.
- [x] Sidebar: "+ New book" (title input, Enter/Esc), click to open, rename (✎ or double-click), delete with a confirm; the last book can't be deleted; switching and deleting wait while a reply streams. **Verify:** headless Chrome: seeded v1 data appeared as "My first book" with its notes, chat and card, v1 key kept; created "Persuasion", typed notes, reloaded (it stayed open with its notes); switched back (notes, 1 card, 2 chat messages intact); renamed to "Pride and Prejudice" (top bar followed); deleted Persuasion (its key removed; delete disabled on the last book).

### R3: PDF view + upload (D29)
- [x] IndexedDB wrapper (`lib/pdf-store.ts`, ~50 lines, no dependency; D23) for one PDF per book; deleting a book deletes its PDF. *Verified in the browser (reload keeps the PDF) instead of with a fake: IndexedDB isn't in Node and a fake would be a new dependency.*
- [x] Upload: Upload in the top bar, a drag-and-drop zone in the empty PDF pane, "Add or replace PDF" under the book; the PDF's text fills the reference text via the existing import, or a banner asks before replacing existing text. PDF-by-URL later (Q8).
- [x] Viewer: pdfjs viewer with selectable text; floating toolbar: zoom out, fit width, zoom in, page box "N of M", download, search with highlighted matches and "n / total". A cite in chat or an open card ("[¶3 · PDF p. 2]") opens the PDF at that page. **Verify:** headless Chrome on two public-domain test PDFs (4 pages each; one from `cupsfilter`, one typeset by Chrome): upload rendered all pages with a text layer and filled the reference text; zoom in/out/fit changed the page width (456 → 507 → 344 → 456 px); page box 3 scrolled page 3 to the top; search "Bennet" found 20 matches, highlights on the words; reload kept the PDF; a `PDF p. 2` cite clicked from the chat view opened page 2; a second upload showed the replace banner; light and dark screenshots; 119 tests, lint, build green.
- [x] *Also (Ronith, mid-step):* the top bar spans the full width above the sidebar (ChatPDF-style), so toggling the sidebar never moves it; the app name moved into the bar and the sidebar's « was removed.

### R3b: reference-text cap (D32)
- [x] Cap the reference text at 25K tokens (chars ÷ 4): over it, React, chat and thread replies pause with a message, and the route refuses `reference_too_long` before any paid call. A PDF over the cap asks which pages to use (prefilled with as many from page 1 as fit); "Choose PDF pages" under the book reopens it. **Verify:** 4 new core tests (estimate, page count/slice, fit, route refusal), 123 tests, lint, build green; headless Chrome: a 38K-token reference showed the notice and disabled React and chat; a 191-page PDF opened the picker at pages 1–41 (~24K tokens); a range past the end disabled Use; pages 3–5 became the reference text and the AI came back.

### R4: page links (D33)
- [x] `core/page-links.ts`: find page references in the notes (bracketed, loose, after a quote), link each to the PDF by exact quote, then word overlap near the estimated page, then page alone; learn the PDF − book page offset from exact hits. The PDF's text is split at every page marker so each piece knows its page. **Verify:** 7 core tests (every reference form once; cites, roman numerals and stray numbers ignored; quote/blockquote/sentence context; exact + offset + overlap + page; quotes, case, spacing, hyphens; PDF-page refs and clamping; marker splitting).
- [x] Editor layer (`lib/page-link-view.ts`): references underlined, ●/◐/○ marker after each, a click opens the PDF at the page and selects the words; nothing written to the notes. **Verify:** headless Chrome with a PDF whose book page N is PDF page N+2: five references linked to PDF pages 5 (exact), 4 (overlap), 7 (overlap), 8 (exact), 6 (page, offset +2 learned); notes byte-identical after linking; clicking ● opened page 5 with the quote selected, ◐ opened page 7 with the paragraph's start selected; clicking the reference text itself opened page 5 too, a plain click on it while editing its line only placed the caret, ⌘-click there opened page 8; typing above them kept the marks on the references; 130 tests, lint, build green.

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
- ~~Sprint 6 QA: a block's caret always opens at the end (clicking mid-sentence doesn't place it there); `checkCitations` flags the AI quoting the reader's notes next to a `[¶n]` (prompts now forbid it, unmeasured); a collapsed card with no replies shows a lone "· Show all"; only http(s)/mailto/relative links stay clickable, so `obsidian://` links render as text~~ (blocks retired by D25; the `checkCitations` note-quote item still stands)
- Sprint 5 QA: "Not in the text" (system.md's wording) appears capitalised mid-sentence ("Whether he'll go is Not in the text here."), Ronith's prompt; React on a paragraph that has a Define quote pasted under it sends the quote line in the excerpt; the router call's tokens aren't in `stats` (Sprint 7 cost logging must add them); at 48–84rem Define/Quiz don't auto-open the drawer (unread dot instead) because it would cover the margin
- Define: the quote is inserted with no undo (Cmd+Z); running Define twice on the same word inserts the quote twice; the status line is truncated at phone width with no tooltip
- Export: notes that start with their own `---` frontmatter get a second block (Obsidian shows it as a rule); the page range uses first/last label in order, so out-of-order markers read "p. 5 to p. 4"
- Route size caps (passage length, turns): needed before the public demo (Sprint 5, D9)
- Labelled, opt-in outside knowledge in a separate uncited block (D5; post-MVP)
- ~~UX redesign: marginalia-first~~ → scheduled by D18 (Sprints 5–6)
- Per-book page offset so PDF pages map to the paper book's pages (Q10 option)
- Highlight the cited text on the PDF page (needs pdfjs rendering instead of the built-in viewer; D23 revisit)
- Bring back Define/Quiz with behaviour Ronith likes (D24): where the reply lands, and whether Define pastes a quote
- R1c QA: ~~margin cards show their excerpt as raw markdown~~ (fixed in R1d); links in the notes aren't clickable (no Cmd-click yet); on phones cards list under the notes, not under each paragraph (D25)
- ~~R3: a whole book's PDF text becomes the reference text, and every AI call sends all of it~~ (capped by D32; the real fix is below)
- Send only the relevant parts of a book (Ronith, D32): structured XML of the book (chapters, pages, paragraphs) and choosing which parts go with each call, instead of one capped reference text. Was: R3 (the status line shows ~tokens). For long books that is expensive per turn: decide between trimming to a chapter, prompt caching (Sprint 7) and retrieval (Q5)
- R3 QA: pdfjs logs one "offsetParent is not set -- cannot scroll" console message when a PDF loads while its view is hidden; harmless (one fix attempt made; the jump and fit work)
- R3 QA: PDF text-layer quality depends on the PDF (a `cupsfilter` PDF splits "fi" ligatures, so "Netherfield" isn't found there)
- Page links by meaning (D33 declined for cost): embeddings (Voyage `voyage-4-lite`, $0.02/M after 200M free tokens; needs VOYAGE_API_KEY and a server route) or Claude ranking the paragraphs near the estimate (~1¢ a reference); and hand corrections (pin a link, re-link)
- R4 QA: live preview hides a bracketed reference's brackets (`[p. 3]` shows as "p. 3"), as markdown reads it as a link; the text keeps them
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
