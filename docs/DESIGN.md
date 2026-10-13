# tertulia-margins: Design Document

*A tertulia of one.* A note-first AI reading partner: you write the margin notes, it talks back.

| | |
|---|---|
| Owner | Ronith (decides); Claude (executes) |
| Status | v2 draft, 2026-10-11 (v1: tag `v1-marginalia`, [archive/v1/DESIGN.md](archive/v1/DESIGN.md)) |
| Budget | v1: 7 days x 3 h = 21 h (spent); v2: time box set by Ronith (PLAN.md) |
| Companion docs | [PLAN.md](PLAN.md) (progress), [DECISIONS.md](DECISIONS.md) (why), [research/v2-insights.md](research/v2-insights.md) (v2 input) |

This document explains *what* we are building and *why this shape*, framed as trade-offs against the constraints. It is a living doc: when implementation teaches us something, this file changes in the same commit.

---

## 0. v2 at a glance: what carries forward, what changes

v2 is an overhaul driven by Ronith's review of similar tools and HCI research ([research/v2-insights.md](research/v2-insights.md), D21). The v1 spec is frozen in [archive/v1/DESIGN.md](archive/v1/DESIGN.md); this section is the bridge.

**Principles carried forward (unchanged unless a later D says so)**

| Principle | Source |
|---|---|
| Note-first: the reader's notes are the primary artifact and steer every reply | §1, Day 0 |
| The AI never edits or writes into the notes; AI text is visually distinct and lives in the margin or chat | D6, D18 |
| Every claim about the book cites `[¶n]`; unsupported → "not in the text"; `checkCitations` verifies quotes deterministically | D4, §6.2 |
| Passage-only knowledge for now | D5 |
| Book text and PDFs stay in the reader's browser; never committed, never shipped | D7, D9, §4 |
| Readers locate passages by the paper book's page; `[p. N]` markers are typed by the reader | D13, D15 |
| Margin reactions (question, pushback, connection) as threads; router picks the kind | D18, D20 |
| Notes are one markdown string; export is the reader's words only | D17, D20 |
| Product logic in `core/`, thin routes, commands and kinds as data tables | §6.1, CLAUDE.md |

**What v2 changes**

| v2 | Replaces | Decision |
|---|---|---|
| Books as folders in a collapsible sidebar; each holds one PDF / reference text and its notes | one global passage + notes | D22, D31 (built R2) |
| A view switcher: Notes + margin, Notes only, PDF only, Chat only | notes + margin, chat in a drawer | D22 |
| The PDF is viewable on demand and opens at a cited page | reference text never shown (D14, superseded) | D22, D23 |
| PDF upload or URL link as the main input | typed/pasted text first, PDF import secondary (D13) | D23; URL handling decided at R3 |
| PDFs in IndexedDB | localStorage only (D7, amended) | D23 |
| Define/Quiz out of the UI for now (core and prompts kept) | toolbar commands (D17) | D24 |
| One notes file in a CodeMirror editor with Obsidian-style live preview | Jupyter-style blocks rendered with `marked` (D18, D20) | D25 |
| Quiet chrome: one bar (☰ · book · Margin PDF Chat · ⤢ · React); book actions in the sidebar | six labelled view buttons, full toolbar | D26 |
| Obsidian's default fonts: system face, 16px/1.5, 700px column | Literata + Hanken Grotesk (D20) | D27 |
| Light theme by default (white, gray, light blue); dark behind a toggle | palette from the system setting | D28 |
| PDF view: pdfjs viewer with a floating toolbar (zoom, page, download, search) | browser's built-in viewer (D23) | D29 |
| Top bar of icon + label toggles, ChatPDF-style | text switcher (D26) | D30 |
| Reference text capped at 25K tokens; PDF page picker | whole reference text every call | D32 |
| Page references in the notes linked to the PDF (exact, word overlap, page), as a computed layer | page numbers as plain text | D33 |
| A book: title, reference text, one notes file, chat, margin threads, PDF | — | D31 |
| Hosted for invited testers: Vercel deploy, then Supabase accounts and data | BYO-key demo (D9), browser-only storage (D7) | D34 |
| Later: cites linked to the actual text (regex + AI around the cited pages), not just the page number | — | parked (PLAN.md R4+) |

## 1. Problem

Good books hide their best ideas in dense passages. A reader working through a physical book transcribes quotes and reflections into Obsidian, but the notes stay inert: nothing pushes back, defines the unfamiliar term, or points out that a reflection misreads the passage.

Existing tools start from the wrong end. NotebookLM and Readwise Ghostreader are **source-first**: you upload text and the AI summarizes or answers. The reader's own thinking is an afterthought.

We want the inverse: **note-first**. The reader's notes are the primary artifact and steer every AI response. The AI's job is to make the reader's thinking sharper, never to do the thinking for them.

## 2. Goals

1. **Grounded conversation about a passage.** Every claim about the book cites the supplied text. Unsupported claims say "not in the text."
2. **Notes steer the AI.** The user's notes are always in context and shape replies. AI text lives only in the margin and chat, so it is never confused with the user's notes (D6, D18).
3. **Commands on a selection.** `/define`, `/quiz`, `/expand` act on a selected line, Jupyter-style.
4. **Augment, don't replace.** The AI can suggest an expansion of a terse note with context from the text, and flags where a note disagrees with the passage. Suggestions appear in chat; the user writes any note text themselves (D6).
5. **Obsidian-compatible.** Notes export to markdown.
6. **Portfolio-grade evidence.** A day-7 write-up with screenshots and *measured* cost-per-session and time-to-first-token (TTFT).
7. **One place per book (v2).** Each book is a folder holding its PDF and notes; the PDF is one click away, opening at the page a note cites (D22, D23).

## 3. Non-goals

These are deliberately excluded so they cannot creep back in silently.

- **Rich-text editor.** The notes are plain markdown text. D25 adds CodeMirror live preview, which only styles that text; no WYSIWYG model, no formatting toolbar.
- **A reading app.** The PDF view is for checking a source, not for reading the book in the app (D22 reopens the view D14 closed; this line keeps its spirit). No annotation on the PDF itself.
- **Tensions across a body of work** (multiple books/authors). This is a research problem. v4 does one book only.
- **Sharing, collaboration, multi-user books.** ~~Accounts, auth, sync~~: D34 adds invite-only accounts and hosted data; each book still belongs to one user.
- **OCR / photo input** in the first week.
- **DRM'd ebooks.** We never handle DRM.
- **Recommendations or summaries.** Blinkist-style summaries are the opposite of the point.

## 4. Constraints

- **21 hours total.** Every decision is judged first by hours saved.
- **The user is learning.** Ronith must understand and make the key decisions, so the code must be legible to someone who did not type it.
- **Copyright.** Book text is the user's private input. It is never committed to git. On the hosted app (D34) each user's books are private to them, and the landing page asks testers to upload only books they own.
- **Cost.** Personal API key; a session should cost cents, not dollars. Measured, not guessed.

## 5. The core loop

The interaction model is the product's whole differentiation, so it is specified first.

0. The user creates a book folder in the sidebar and adds the book: a PDF upload or URL link, or typed/pasted text with `[p. N]` markers (D13, D23). The PDF's text becomes the reference text the AI is grounded in.
1. The reference text stays in the background for the AI; the PDF itself is a view the user can open, or that opens at the cited page when they click a source (D22).
2. The user writes notes in the notes column as they read, exactly as they would in Obsidian.
3. The user selects a line in their notes and runs a command, or asks a free-form question in the chat.
4. The AI replies in the chat (commands, questions) or the margin (reactions), citing paragraphs of the passage. Replies never edit the user's notes. Which of margin, PDF or chat fills the right pane is the view the user picked (D22).
5. The user may press **React** on a note (the selection or the paragraph at the cursor): the AI answers in the margin column beside the notes with a probing question, a pushback cited `[¶n]`, or a connection to another passage. Each reaction is a thread the user can reply to. Nothing is added to the notes. The chat stays one view-switch away (D22; v1 had it in a drawer, D18; replaces Augment).
6. Commands that point at the text (e.g. `/define`) also get a verbatim passage snippet with its `[¶n]`, pasted into the notes by the app (plain code, not the model) and marked as a quote. Commands run from a toolbar above the notes on the selected text; `/define` picks the occurrence nearest the cites around the selection, else the first (D17).
7. Export produces one markdown file: frontmatter (date, reference page range), then the user's notes with their inline passage quotes. No AI-written text, no reference text (D17).

The invariant: **the notes pane holds only the user's words and verbatim passage quotes. AI-written text never enters it** (D6). AI text lives in the margin or the chat, visually distinct (D18).

## 6. Design overview

```
Browser (one page)        [ Notes+Margin | Notes | PDF | Chat ]   ← view switcher (D22)
  ┌──────────┬───────────────────╥──────────────────┐
  │ Sidebar  │  Notes (blocks)   ║  right pane:     │   notes, chat, reactions: localStorage
  │ (1/6,    │  (3/6)            ║  margin | PDF |  │   PDFs: IndexedDB (D23)
  │ books as │                   ║  chat (2/6)      │
  │ folders) │                   ║                  │
  └──────────┴────────┬──────────╨───────▲──────────┘
          │ POST /api/converse   │ streamed text + citation flags
          ▼                      │
  route handler (thin: parse, call core, stream out)
          │
          ▼
  core/  (plain TypeScript, no framework imports)
    converse(request) ──► buildContext ──► pickModel ──► stream from Claude
                                                    └──► checkCitations
  prompts/  (markdown files the user owns and edits)
```

On the hosted app (D34), `proxy.ts` lets a request through only with the invite cookie that `/invite` sets (off when `INVITE_CODE` is unset). The route answers with NDJSON (one JSON event per line: for a reaction a `kind` event first, then `text` deltas, then `done` with stats or `error`), and rejects invalid bodies with a 400 code from `parseConverseRequest` before any paid call. The browser has one client for the route, `lib/converse-client.ts`; chat, commands, reactions and thread replies all stream through it, each into its own message, so several streams can run at once. PDF import runs in the browser: `lib/pdf-import.ts` is the adapter that reads pages with pdfjs and hands them to `core/pdf-paragraphs.ts`.

### 6.1 Why it is shaped like this

**Next.js is a thin shell.** All product logic lives in `core/` as plain TypeScript with no framework imports. The route handler only parses input and streams output. This keeps framework "magic" out of the parts Ronith needs to understand, and means `core/` can be tested without a server.

**One deep module, not many shallow ones.** `converse()` is the single entry point: it takes `{passage, question, notes, history, book, command, reaction}`, where the optional `command` is `{name, selection}` and `question` is what chat shows (e.g. `/define levity`), and returns a stream of text (preceded by a `kind` for a reaction), then stats with the citation checks. The route streams these to the browser as NDJSON. Context assembly, model routing, and citation checking are internal details. The UI never knows which model ran.

**Prompts are data, not code.** Each command's instructions live in `prompts/<command>.md`. Ronith writes and tunes these directly; they are the most important "code" in the project and the part that should carry his voice and judgment.

**Commands are a table, not a class hierarchy.** A command is `{name, promptFile, maxTokens}` in `core/commands.ts` (a `model` column joins with routing, §6.4; D11). Adding a command is adding a row. The `/define` passage quote is plain code in the same module (`defineQuote`, `insertAfterLine`), run in the browser (D17).

**Page links are a computed layer over the notes (D33).** `core/page-links.ts` finds page references in the notes (`[p. 42]`, `p. 42`, `page 42`, “…” (42), “…” — 42) and links each to the open book's PDF, free methods only and surest first: the quote found exactly (●), else the nearby paragraph sharing the most rare words (◐), else the estimated page (○); exact hits teach the book's PDF − paper page offset. The page recomputes links from the notes (deferred while typing) and the whole PDF's text; `lib/page-link-view.ts` draws them in the editor as an underline and a marker that opens the PDF at the page with the words selected. Nothing is written into the notes, so the markdown file and its export stay the reader's own.

**Books are a library plus one key per book (D31).** `core/store` keeps a small library (the books' titles and which one is open) under `tertulia-margins:library`, and each book's reference text, notes, chat and margin threads under its own key in v1's shape, so saving one book never rewrites another's text. The first v2 load copies v1's state into "My first book" and leaves the v1 key as a backup. Switching books saves the open one first; while a reply streams, switching and deleting wait, so the reply can't land in the wrong book.

**Layout is views over one book (D22).** The page shows one book at a time: the sidebar picks the book; the top bar picks what sits beside the notes (Margin, PDF or Chat) and ⤢ shows it alone (Margin alone = the notes alone) (D26). The view is `data-view` on `<main>` and CSS does the rest: every pane stays mounted and hidden ones are `display: none`. Define and Quiz switch to Notes + chat so their reply is visible (on a phone, an unread dot on Chat instead). Every view reads the same book state, so switching views never loses a stream or an edit. An "only" view fills everything beside the sidebar; the view and the sidebar's state are remembered; the reference-text editor, PDF import and export live under the book in the sidebar; on phones the sidebar is an overlay and one pane shows at a time (a *Beside notes* PDF or chat shows instead of the notes).

**The PDF view is pdfjs's viewer with our toolbar (D29).** Each book's PDF is stored in IndexedDB (`lib/pdf-store.ts`, keyed by book id; D23). `PdfPane` shows a drop zone until there is one, then `PdfViewer`: pdfjs's `PDFViewer` (pages with a selectable text layer) and its find controller (highlighted matches), under a floating toolbar: zoom out, fit width, zoom in, "N of M", download, search. Adding a PDF fills the book's reference text from its text (`lib/pdf-import.ts`, D13), or asks first if there is some. Each open document gets its own pdfjs worker, closed with it. A labelled cite in AI text ("[¶3 · PDF p. 2]", `CitedText`) opens the PDF at that page (`citedPage` in `core/passage.ts`); a page asked for while the view is hidden waits until it is shown and fitted. MVP: the page as given. Later: match the cited text around that page (regex, then AI) so an off-by-a-few page still lands on the right passage.

**Notes are one file with live preview (D25).** The notes are one markdown string in one CodeMirror editor (`app/components/Notes.tsx`). `lib/live-preview.ts` parses it with `@lezer/markdown` (GFM) and decorates it in place: headings, bold, italics, code, links, quotes, bullets and `[¶n]` cites render, and their symbols show only on the lines the selection touches. Decorations never change the text, and raw HTML stays text. `core/blocks.ts` still splits the notes into paragraphs (runs of non-blank lines): React acts on the selection or the paragraph at the caret, and the margin groups cards by the paragraph their excerpt starts in. The margin works like comments in a document: on wide screens each group starts level with its paragraph's first line and slides down past earlier groups (`stackCards`); on phones the cards list under the notes. *(v1: Jupyter-style blocks rendered with `marked`, D18/D20; superseded.)*

**Reactions go through `converse()` too (D18, D20).** A request with `reaction: {excerpt, kind?}` is a margin reaction. With no `kind`, a short non-streamed router call (`prompts/react-router.md`) picks question, pushback or connection; `converse()` yields the kind (the route sends it as a `kind` event), then streams the reply from `prompts/react-<kind>.md`, citations checked as usual. Kinds are a table in `core/reactions.ts`, like commands, next to the anchoring helpers (`reactTarget`, `findExcerpt`). A reply in a thread sends the kind it already has (no router call), the thread as `history` and the reply as `question`.

### 6.2 Grounding: how we stop invented quotes

This is the highest technical risk (see §9), so it gets a concrete mechanism rather than a hopeful prompt.

1. **Paragraph IDs.** The passage is split into paragraphs and labelled `[¶1]`, `[¶2]`, ... before it goes into the prompt. The app also records each paragraph's page from the `[p. N]` markers in the reference text, which are stripped before the text reaches the model (D13). PDF import inserts `[PDF p. N]` markers instead, since its pages don't match the paper book. The model cites `[¶n]`; the UI shows the page beside it, so the model never has to guess a page number.
2. **Cite or abstain.** The system prompt requires every claim about the book to cite `[¶n]` and to quote at most a short span. If the text does not support an answer, the model says "not in the text."
3. **Deterministic check.** After streaming, `checkCitations` verifies each quoted span actually appears in the cited paragraph (after whitespace/quote normalization). Failures are flagged in the UI, not hidden.
   Rules (Ronith, Sprint 1): a quote is checked against the citations in its own sentence (none → `citation_missing`); a range like `[¶18-19]` passes if the quote is in any paragraph of it; quotes under 3 words are scare-quotes and are skipped; a cite to a paragraph that doesn't exist is `citation_not_found`; otherwise `quote_not_in_paragraph`. Normalization ignores case, curly vs straight quotes, `_italics_` markers, spacing and trailing punctuation; `…` splits a quote into fragments that must each appear.

Step 3 is the key idea: it turns "is the model hallucinating?" from a vibe into a number we can put in the write-up.

*Objection: "Won't strict grounding make the AI useless for background, like an author's biography?"* Possibly. For the MVP we accept that cost: the AI is strictly passage-only (D5). Labelled outside knowledge is a post-MVP addition (PLAN.md Parking lot).

### 6.3 Context and cost

The prompt is ordered stable-to-volatile: system prompt, then passage, then notes, then the conversation. A command's instructions ride in the last user turn, not the system prompt, so the prefix is the same for chat and every command. Reactions do the same: the router and each kind send `<router>` or `<reaction>` instructions plus the `<excerpt>` in the user turn; a thread reply re-sends that opening turn ahead of the thread. The passage is the largest and most stable part, so it is the prefix we **prompt-cache**. Caching should cut both cost and TTFT on every turn after the first; we will measure the before/after, since it makes a concrete write-up result.

### 6.4 Model routing

Different commands have different needs. `/define` needs speed; `/tensions` needs depth. Routing by command lets us measure that trade-off directly. The MVP uses a single model for everything (D11). Routing is a day-5 item. Starting hypothesis (to be validated then, see Q3):

| Command | Need | Candidate |
|---|---|---|
| `/define` | fast, cheap | Haiku 4.5 |
| chat, `/expand`, `/quiz`, Augment | quality at reasonable latency | Sonnet 5.5 |
| `/tensions` | depth over a whole book | Opus 5.5 |

### 6.5 Book-level memory (v3)

The obvious answer is RAG: chunk, embed, retrieve. The less obvious alternative: a whole book often fits in a long context window, and prompt caching makes re-sending it cheap after the first call. Long-context has no retrieval misses and no embedding infrastructure, but it costs more per cold call. We will pick on day 6 using a measurement, not a preference (Q5).

## 7. Evaluation

Fuzzy output still needs numbers. A small eval set (10–20 cases on one chapter Ronith has already annotated) checks:

| Metric | How | Type |
|---|---|---|
| Citation validity | % of quoted spans found in cited ¶ | deterministic |
| Abstention | questions with no answer in text → says "not in the text" | deterministic (string match) |
| Note disagreement caught | seeded wrong notes get flagged | LLM-judge + Ronith spot-check |
| TTFT, total latency | timed per command, cached vs uncached | measured |
| Cost per session | tokens x price, from API usage fields | measured |

Evals run as a script, not by eye, so every prompt change can be re-scored.

## 8. Milestones

Detailed, checkbox-level plan lives in [PLAN.md](PLAN.md), organised as one sprint per day (Sprint n = Day n) with an explicit MVP in/out list. Summary:

| Day | Version | Done when |
|---|---|---|
| 0 | Homework | Manual Claude test + competitor notes written (seeds prompts and spec) |
| 1–2 | v0 | Upload or paste a chapter, stream grounded conversation, citations checked |
| 3–4 | v1 | **MVP.** Notes pane + chat pane, `/define` `/quiz` on selection, persisted, markdown export (D11) |
| 5 | v2 | Marginalia: React button, reactions (question, pushback, connection) as threads in a margin column, chat in a drawer (D18) |
| 6 | v3 | Notes as Jupyter-style blocks rendered with `marked`; visual redesign (D18) |
| 7 | v4 | Prompt caching and logging, eval set, write-up (moved after the v2 overhaul, D21) |
| v2 | R1–R3 | Layout shell with view switcher; books as folders; PDF view with upload/URL (D21–D23). Then Sprint 7 on the v2 UI |

Book-level memory, `/tensions`, `/expand`, model routing and the public demo moved to the PLAN.md Parking lot (D18).

**Cut line:** ~~if the MVP (v1) is not done by end of day 4, everything after it is dropped except the write-up.~~ Superseded by D18: v1 shipped but isn't the product yet; v2 (marginalia) is the milestone that must land before the write-up.

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Model invents quotes/page numbers | High | ¶ IDs + deterministic citation check (§6.2) |
| Getting text in is harder than Obsidian habit | Medium | Typed/pasted reference text with page markers, PDF import as a shortcut (D13); revisit after real use |
| Editor rabbit hole | Medium | Plain textarea is a non-goal boundary (§3) |
| Scope creep into "tensions across works" | High | Non-goal; v4 is one book |
| Ronith loses the thread of the code | Medium | Working agreement in CLAUDE.md; `/decide`, `/explain` skills |
| Book text leaks into git/public demo | Low, costly | `.gitignore` covers `books/`; demo uses public-domain text |

## 10. Open questions (owner: Ronith)

Each becomes an entry in [DECISIONS.md](DECISIONS.md) when answered.

- **Q1. Storage.** *Resolved (D7): browser localStorage behind a small `store` module, plus markdown export.*
- **Q2. Outside knowledge.** *Resolved (D5): strictly the passage for the MVP; labelled outside knowledge is added later.*
- **Q3. Model per command.** Confirm the §6.4 routing after measuring.
- **Q4. Hosting.** *Resolved (D34, superseding D9): Vercel + Supabase for invited testers; stage 1 deploys behind an invite code, stage 2 adds magic-link accounts and hosted data; Ronith's key with a $3/day per-account cap.*
- **Q5. v3 approach.** Long-context + caching vs chunked retrieval.
- **Q6. Write-up audience.** *Resolved (D10): LLM engineers, with a one-paragraph product story and screenshots up top.*
- **Q7. Day-0 findings.** *Resolved (D6): the AI never writes into the notes; §5 amended.*
- **Q8. PDF by URL (R3).** Fetching from the browser fails on most sites (CORS); a server route that fetches it works but is an open proxy on the public demo (D9). Options: browser fetch with a clear error, a size-capped route, or upload only.
- **Q9. Book data model (R2).** *Resolved (D31): one notes file per book; v1's state becomes "My first book".*
- **Q10. Page mismatch (R3+).** *Resolved (D33): both: page links match the cited text and learn a per-book offset from exact hits.*
- **Q12. Sending parts of a book.** D32 caps the reference text at 25K tokens; Ronith wants to explore structured XML and sending only the relevant parts per call (relates to Q5).
- **Q11. v2 time box.** How many hours the overhaul gets before Sprint 7 (D21).

---

## Appendix A: Landscape (checked October 2026)

- **SaaS reading tools:** Readwise/Reader (Ghostreader), Zotero, Obsidian/Notion plugins, Blinkist/Shortform. Pocket shut down July 8, 2025.
- **AI-native:** NotebookLM (closest; source-first), Claude Projects/ChatGPT, small book apps (Chapterly, Cognito, BookPilot).
- **Same niche:** BookSage (github.com/Waleed-Khalid-dev/BookSage), scholiaai.com.
- **Granola:** the interaction model we borrow (user notes + AI augmentation), applied to meetings, not books.
- **Gaps:** user notes steering the AI; tensions across a body of work; physical-book readers.

## Appendix B: Naming

"Tertulia" alone collides with tertulia.com (a book-discovery app, same audience), so the public name is **tertulia-margins** plus a descriptor. Dropped: Scholia (direct competitor), Palimpsest (crowded), Book-talk (means something else). Domain and handle availability: not yet checked.

## Appendix C: Glossary

- **Passage:** the text the user pasted; the only source of truth about the book.
- **Note:** text the user wrote. Never edited by the AI.
- **Passage quote:** a verbatim snippet of the passage with its `[¶n]`, pasted into the notes by the app and visibly marked. Not AI-written.
- **¶n:** paragraph ID used for citations. Each ¶ also carries a page label (printed page if detected, else PDF page).
- **Book (folder):** a sidebar entry holding one book's PDF / reference text, notes, chat and reactions (D22).
- **View:** what the page shows besides the sidebar: Notes + margin, Notes only, PDF only, Chat only (D22).
- **Augment:** the AI suggests an expansion of a note in chat; the user writes any note text themselves.
- **TTFT:** time to first token of a streamed reply.
