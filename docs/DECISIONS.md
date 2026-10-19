# Decision Log

Append-only. Each entry records **what** was decided, **who** decided, the **alternatives**, and **why**. Code and tests show *what*; this file keeps the *why*.

Status values: `Open` → `Provisional` (default chosen, revisit allowed) → `Accepted` → `Superseded by Dn`.

To add one, run `/decide <topic>`, or copy the template at the bottom.

---

## D1. Tech stack: Next.js + TypeScript
- **Status:** Provisional (2026-10-08, Ronith: "fine for the time being")
- **Alternatives:** Python FastAPI + vanilla JS; Streamlit/Gradio; local CLI/desktop.
- **Why:** one language end to end, first-class streaming, free Vercel deploy for a live portfolio link.
- **Cost we accept:** framework magic. Mitigated by keeping all logic in plain-TS `core/` and using Next only as a thin shell.
- **Revisit if:** Python evals/retrieval tooling becomes the bottleneck on day 6–7.

## D2. Working agreement: ask first, log decisions
- **Status:** Provisional (2026-10-08)
- **Alternatives:** explain-after-each-step; Ronith writes the core while Claude scaffolds.
- **Why:** keeps Ronith in the driver's seat without making him type the boilerplate. Ronith owns `prompts/`; Claude owns plumbing.
- **Details:** see CLAUDE.md, "Working agreement".

## D3. Book input: paste text
- **Status:** Amended by D8 (2026-10-08); paste stays as a fallback
- **Alternatives:** DRM-free EPUB/txt upload (~2 h); photo + OCR (time sink).
- **Why:** zero ingestion work, so v0 can test the core idea on day 1.
- **Revisit if:** v3 (whole book) needs it, or pasting proves harder than the Obsidian habit.

## D4. Grounding via paragraph IDs + deterministic citation check
- **Status:** Provisional (2026-10-08), proposed in DESIGN.md §6.2; paragraph IDs replaced by page cites in D38 (the deterministic check stays)
- **Alternatives:** prompt-only grounding; Anthropic citations API feature.
- **Why:** a check we control makes hallucination a number, not a vibe.
- **Open sub-question:** compare against the API's built-in citations on day 2 (`/decide` then).

## D5. Outside knowledge: passage-only for the MVP (Q2)
- **Status:** Accepted (2026-10-08, Ronith: "the core functionality in the MVP doesn't need that"); amended by D39 (one labelled daemon may bring outside knowledge; chat stays book-only)
- **Context:** Day 0 notes wanted counterpoints (Goodreads/Reddit) and outside perspective; DESIGN.md treats the passage as the only source of truth.
- **Alternatives:** labelled, opt-in outside knowledge in a separate uncited block (~1 h); B plus fetched Goodreads/Reddit material (4+ h, new dependencies, ToS).
- **Why:** the MVP's core is grounded conversation steered by the reader's notes; outside knowledge adds hours and a way for unverifiable claims in without helping that core.
- **Cost we accept:** no author or historical background, and no counterpoints beyond the text.
- **Revisit if:** v2 is done and there is time, or real use shows the passage alone is too thin. Preferred shape then: option B (labelled, opt-in, skipped by `checkCitations`).

## D6. The AI never writes into the notes (Q7)
- **Status:** Accepted (2026-10-08, Ronith); amended by D18 (AI text may also appear in the margin column)
- **Context:** Day 0: Claude's app was verbose, led the conversation, and buried the user's notes. Ronith's rule: the user stays in the driver seat, and the notes must not drift toward being AI-run.
- **Alternatives:** amend §5 but allow user-initiated pinning of chat text into notes (~1 h); keep Augment blocks beneath notes with accept/edit/discard.
- **Why:** the notes pane stays trustworthy by construction. A passage snippet pasted by code, not the model, can be checked by `checkCitations`; AI suggestions stay in chat and the user retypes them in their own words.
- **Cost we accept:** no one-click AI notes; Augment is a chat suggestion, not a block.
- **Details:** `/define` shows the definition in chat; the app pastes the verbatim sentence with `[¶n]` into the notes; the user writes the definition themselves. Export has no AI text.
- **Revisit if:** typing everything yourself proves too slow in real use.

## D7. Storage: browser localStorage + markdown export (Q1)
- **Status:** Accepted (2026-10-08, Ronith); amended by D23 (PDFs go in IndexedDB); superseded by D34 stage 2 (data moves to Supabase)
- **Context:** passage and notes must survive a reload; D1 chose a Vercel-deployable stack.
- **Alternatives:** `.md` files on disk through route handlers (~3 h, needs a writable disk); SQLite (3-4 h, new dependency, same disk limit).
- **Why:** about 2 h cheaper than the alternatives and keeps the Vercel path open. Only the `store` module touches storage, so swapping later is one module.
- **Cost we accept:** data lives in one browser and is lost if site data is cleared; roughly 5 MB limit. Markdown export is the safety net.
- **Revisit if:** browser-only storage loses data in real use, or notes need to live directly in the Obsidian vault (then option B).

## D8. Citations show page numbers; input becomes PDF upload
- **Status:** Amended by D13 (2026-10-09). Originally Accepted (2026-10-08, Ronith: readers rely on the page numbers printed in the book; otherwise use paragraph and PDF page numbers)
- **Context:** pasted text has no reliable page numbers, but Ronith wants citations a reader can find in the physical book. Touches D3 and D4.
- **Alternatives:** page markers typed into pasted text (~0.5 h, no dependency); `[¶n]` only for the MVP.
- **Why:** page numbers are what readers use to locate a passage.
- **Rule:** use the printed page number when it can be detected; otherwise the PDF page. `[¶n]` stays the internal ID that `checkCitations` verifies; the UI renders the page next to it.
- **Cost we accept:** about 2 h (my estimate) and a new PDF-parsing dependency, which needs Ronith's approval before install. Extra risk on Days 1-2; printed page numbers may be hard to detect reliably.
- **Assumption (correct me):** paste remains as a fallback input.
- **Revisit if:** printed-page detection proves unreliable (fall back to PDF page numbers only), or Days 1-2 slip.

## D9. Hosting: public demo, bring-your-own API key (Q4)
- **Status:** Superseded by D34 (2026-10-12, Ronith)
- **Context:** a live link helps the portfolio; Anthropic API cost and book copyright rule out an open demo on Ronith's key with uploaded books.
- **Alternatives:** local-only with screenshots (0 h); public demo on Ronith's key with rate limit and spend cap (2-3 h, open-ended cost).
- **Why:** gives a live link for about 1 h with no cost exposure. D1 and D7 already allow it (Vercel, browser storage).
- **Rules:** the demo bundles public-domain sample text only. Visitors' uploaded PDFs stay in their own browser (D7). The key is passed per request and never stored or logged server-side. Local development still uses `.env.local`.
- **Cost we accept:** visitors need their own API key, and the key sits in their browser. Scheduled on Day 5 after v2, so it is cut if v1 slips.
- **Revisit if:** the key handling looks unsafe once built (`/decide` the proxy shape), or friction makes the demo unused.

## D10. Write-up audience: LLM engineers (Q6)
- **Status:** Accepted (2026-10-08, Ronith)
- **Context:** the Day 7 write-up must lead with something; DESIGN.md goal 6 promises measured numbers.
- **Alternatives:** recruiters and general portfolio readers (story first, numbers in an appendix); book readers (experience first, almost no numbers).
- **Why:** the measured numbers (citation validity, cost per session, TTFT cached vs uncached) are what separates this from other chat-with-a-book projects.
- **Rule:** open with a one-paragraph product story and screenshots, then the numbers and trade-offs.
- **Cost we accept:** a less accessible write-up for non-technical readers.
- **Revisit if:** the write-up is actually going to a different audience.

## D11. MVP scope: the minimal loop plus `/quiz`
- **Status:** Accepted (2026-10-08, Ronith)
- **Context:** Ronith asked for the smallest useful product. Audit of PLAN.md: only the grounded chat, notes file, PDF/paste input, `/define` and persistence are needed for the core loop.
- **Alternatives:** minimal loop only (no `/quiz`); keep the whole current plan. Also offered: open and save an Obsidian `.md` file via the File System Access API; declined, D7 stands.
- **Why:** the MVP should prove the loop on a real book and vault before measurement, extra commands and the demo.
- **MVP (v1):** upload/paste with page labels (D8), grounded chat with citations, two panes, notes always in context, `/define` and `/quiz`, localStorage with markdown export (D7). One model.
- **After the MVP, in order:** caching and per-call logging (feeds D10), `/expand`, Augment, disagreement flags, model routing, public demo (D9). Items that don't fit go to the parking lot.
- **Cost we accept:** no disagreement flags until Day 5, though prompt rule 3 already pushes back; notes move to Obsidian by export, not live.
- **Revisit if:** the MVP isn't done by end of Day 4 (cut everything after it), or the export step proves annoying (then the vault-file option in the parking lot).

## D12. MVP model and API client: Sonnet 5.5 at effort `low`, via `@anthropic-ai/sdk`
- **Status:** Accepted (2026-10-08, Ronith)
- **Context:** D11 says one model for the MVP; `core/converse` needs a way to call Claude.
- **Alternatives (model):** Opus 5.5 ($4/$20 per MTok; thinking can't be disabled, slower first token); Haiku 5.5 ($0.10/$0.50; close-reading quality unproven). Sonnet 5.5 is $2/$10, cache reads $0.20 (prices from the `claude-api` skill, cached 2026-10-06).
- **Alternatives (client):** hand-rolled `fetch` + SSE parsing (~60 lines, no dependency).
- **Why:** TTFT matters most when replying to notes while reading; cost is cents per turn on any of the three. The SDK owns streaming, retries and typed errors, where hand-rolled bugs hide.
- **Details:** server-side refusal fallback on (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) so a mis-flagged refusal is retried instead of returning nothing.
- **Cost we accept:** one dependency; possibly shallower readings than Opus.
- **Revisit if:** Sprint 5's Q3 measurement shows Opus reads meaningfully better, or TTFT at `low` is still slow.

## D13. Page labels come from typed `[p. N]` markers; PDF import is secondary (amends D8)
- **Status:** Accepted (2026-10-09, Ronith)
- **Context:** Ronith's PDF was produced by calibre from an ebook: 137 pages with a text layer but no printed page numbers, and its pages don't match the paper edition. D8's printed-page detection can't work on it.
- **Alternatives:** approximate book pages interpolated from a typed chapter range (~0.5 h, off by a page or two); PDF page numbers only.
- **Why:** readers locate passages by the paper book's page; only the reader knows it, so the reader types it.
- **Rule:** a `[p. N]` marker labels every paragraph after it until the next marker; a paragraph containing a marker gets a range. Markers are stripped before the text reaches the model. PDF import (`pdfjs-dist`, in the browser so PDFs stay local per D9) fills the same reference-text box with `[PDF p. N]` markers for the user to trim.
- **Cost we accept:** typing markers by hand; one new dependency for a secondary path.
- **Revisit if:** PDF import's paragraph detection is unreliable, or typing markers proves tedious in real use.

## D14. Reference text lives in the background, not in a pane
- **Status:** Superseded by D22 (2026-10-11: the PDF becomes a view). Originally Accepted (2026-10-09, Ronith: "there is no actual book to display… it should live in the background as a reference text")
- **Context:** Sprint 3 needs to place the passage; this is a companion to a paper book, not a reading app (Day 0).
- **Alternatives:** collapsible passage above the notes; three columns (passage | notes | chat).
- **Why:** the reader reads the paper book; the app only needs the text to ground and check citations.
- **Rule:** two panes, notes | chat. The reference text is editable on demand (e.g. a drawer) but never shown as a reading pane.
- **Cost we accept:** Sprint 4 selection commands act on notes, not on displayed passage text.
- **Revisit if:** checking citations against the text proves awkward without seeing it.

## D15. Page-marker syntax
- **Status:** Accepted (2026-10-09, Ronith)
- **Context:** review found `[p 101]`, `[pp. 10-11]` and `[p. xii]` reaching the model as plain text.
- **Alternatives:** keep `[p. N]`, `[p.N]`, `[PDF p. N]` only; tolerate a missing dot and explicit ranges but no roman numerals.
- **Rule:** recognise `[p. N]` with or without the dot, explicit ranges `[pp. N-M]` (hyphen or en dash), roman-numeral pages (`[p. xii]`, any case), and the `PDF` prefix on each.
- **Also decided (Sprint 2 review):** editing the reference text mid-conversation is not handled in the MVP; route size caps wait for the public demo (Sprint 5). Both are in the Parking lot.

## D16. Marginalia-first redesign: after the MVP, not in Sprint 4
- **Status:** Accepted (2026-10-09, Ronith)
- **Context:** Ronith finds the two-pane UI sparse and the chat not very useful. He wants the AI to react unprompted to his notes with probing questions in a margin column (chat minimized), and notes rendered as markdown. Touches D6, D11, DESIGN §3.
- **Alternatives:** swap marginalia into Sprint 4 in place of `/define` and `/quiz` (about +1.5 h, auto-trigger on blur, one reaction per block); button-triggered margin reactions first (about 3 h).
- **Why:** the MVP gate stays intact; Sprint 4 ships `/define`, `/quiz` and export as planned and real use informs the redesign.
- **Rules:** markdown-rendered notes is a separate step after marginalia (about 30 lines of our own renderer, no new dependency, not a rich-text editor). Marginalia replaces or absorbs Augment and disagreement flags where they overlap.
- **Cost we accept:** the MVP ships with the interface Ronith dislikes.
- **Revisit if:** Sprint 4 real-chapter use shows the chat and commands are unusable (then pull marginalia forward). D6 must be amended (distinct AI-only margin area, notes still never edited) before building.

## D17. Sprint 4 shape: toolbar commands, context-aware `/define` quote, export with frontmatter
- **Status:** Accepted (2026-10-09, Ronith)
- **Context:** Sprint 4 builds the command table, `/define`, `/quiz` and export; each hid a product choice.
- **Alternatives:** commands typed in the chat box, or both; up to 3 quoted sentences, or appended at the end of the notes; export with the full reference text, or notes only; command instructions kept in `system.md`.
- **Rules:**
  - *Trigger:* select text in the notes, click Define or Quiz in a toolbar above the notes. The command shows in chat as `/define <word>`. Quiz with no selection covers all notes; with a selection, that part.
  - *`/define` quote (code, not the model; D6):* one passage sentence containing the word, inserted as a blockquote on the line after the selection, e.g. `> “…sentence…” [¶4, p. 12]`. Choose the occurrence by context: the nearest `[¶n]` or page cite in the notes around the selection picks the closest occurrence (word on p. 5 and p. 50, nearby note cites p. 48 → the p. 50 sentence). No nearby cite → first occurrence. Word not in the passage → nothing inserted.
  - *Export:* the notes as written, plus YAML frontmatter (export date, reference page range). No AI text, no reference text.
  - *Prompts:* a command is a row `{name, promptFile, maxTokens}`; `prompts/define.md` and `prompts/quiz.md` hold Ronith's existing `<commands>` lines moved verbatim.
  - *Process (this sprint):* Claude commits each verified step and reports evidence.
- **Why:** keeps the "on selection" idea from DESIGN §2, puts the quote next to the thought it serves, and keeps the vault file the reader's own words.
- **Cost we accept:** the context heuristic can pick wrong when notes cite several places; the quote is visible and editable, so the reader can fix it.
- **Revisit if:** the picked sentence is often wrong in real use.

## D18. Re-plan after Sprint 4: marginalia first, then blocks; export deprioritized (amends D6, D11, D16)
- **Status:** Accepted (2026-10-09, Ronith: "this project is not ready… the ui is unappealing"); layout amended by D22 (the chat drawer becomes a view); marginalia superseded by D37 (daemons)
- **Context:** after Sprint 4, the two-pane notes | chat UI feels unappealing and the chat not very useful. Ronith wants notes rendered like Obsidian and the AI to collaborate in the margin. Export is built (Sprint 4) but no longer a priority.
- **Alternatives:** rendering by true live preview (CodeMirror 6, ~5 h) or a side-by-side preview; reactions triggered on leaving a block or after a typing pause; our own markdown renderer; blocks first, or both in one sprint.
- **Rules:**
  - *Marginalia (Sprint 5):* a React button acts on the selection, or on the paragraph at the cursor. One reaction appears in a margin column beside the notes, anchored to that excerpt. A reaction can be a probing question, a pushback (where the note disagrees with or overreaches the text, cited `[¶n]`), or a connection to another passage. Each reaction is a thread the reader can reply to. The chat becomes a collapsed drawer.
  - *D6 amended:* AI text may appear in the margin column, visually distinct from the notes; it still never enters the notes.
  - *Blocks (Sprint 6):* notes become Jupyter-style blocks. Every block renders as markdown, and the one being edited shows raw text. Rendering uses `marked` (new dependency, approved). Not a rich-text editor: each block is still plain markdown text (DESIGN §3 stands).
  - *Pushed to the Parking lot:* `/expand`, model routing, public demo, book-level memory, `/tensions`. Augment and disagreement flags are absorbed by React. Caching and logging move to Sprint 7 to feed the write-up.
- **Why:** prove the AI's value as a margin collaborator before polishing the editor; a button keeps cost and noise low while the reaction prompt is tuned.
- **Cost we accept:** Sprint 5's margin sits beside a plain textarea, so reactions can't line up with their text exactly; the MVP gate in D11 is effectively replaced by the marginalia milestone.
- **Revisit if:** the button feels like a chore (then a smarter trigger: threads across blocks, or a periodic pass over all notes, Parking lot).

## D19. Claude drafts new prompts now; Ronith refines them in Sprint 7 (amends D2)
- **Status:** Accepted (2026-10-09, Ronith: "you can create the prompts and in a final sprint stage, I'll review and refine them")
- **Context:** Sprint 5 needs a new reaction prompt; under D2 every prompt waited on Ronith, which would stall the build.
- **Alternatives:** Claude proposes each prompt and waits for approval (D2 as written).
- **Why:** keeps Sprints 5–6 moving; prompt quality is tuned once, with real use and evals in hand.
- **Rules:** Claude may create new `prompts/*.md` files and keeps them in Ronith's voice, building on `system.md`. Existing prompt text (`system.md`, `define.md`, `quiz.md`) changes only with his approval. Every Claude-drafted prompt gets an owner comment saying so.
- **Cost we accept:** reactions in Sprints 5–6 run on unreviewed prompts.
- **Revisit if:** reactions are off-voice badly enough to hide whether the feature works.

## D20. Sprint 5–6 shape: routed reactions, commands stay in chat, blocks split the notes text, excerpt anchors
- **Status:** Accepted (2026-10-09, Ronith); routed reactions and threads superseded by D37
- **Context:** D18 left four choices open: who picks a reaction's kind, where command replies go, how blocks are stored, how reactions stay attached.
- **Alternatives:** the reader always picks the kind from a menu; Define/Quiz replies as margin threads; blocks as an array with IDs; anchors by position.
- **Rules:**
  - *Kind, router style:* clicking React runs a router call that picks the most useful kind (question, pushback, connection), then the matching prompt writes the reaction. Right-clicking React opens a menu to pick the kind yourself (no router call). The notes' own browser context menu is untouched.
  - *Commands:* `/define` and `/quiz` replies stay in the chat drawer.
  - *Blocks:* notes stay one markdown string; a block is a chunk separated by blank lines. No storage migration; export and the AI see the same text.
  - *Anchors:* a reaction stores the exact excerpt it reacted to and finds it in the notes; if the text is rewritten, the reaction stays, marked "note changed".
  - *Also decided (design-spec review):* fonts Literata (notes) and Hanken Grotesk (AI, UI) via Next's built-in `next/font`, no npm package; reactions stream in parallel with each other and with chat; raw HTML in notes is escaped, not rendered; each React makes a new card, even on an excerpt that already has one.
- **Why:** routing gets the right kind without asking, while the menu keeps control one click away; one string keeps every existing feature working.
- **Cost we accept:** two model calls per routed reaction (router first, so a little more latency and cost); a blank line inside a code block splits it.
- **Revisit if:** the router picks badly or the extra latency shows (then a faster model for the router, Q3), or reactions detach too often.

## D21. v2 overhaul: v1 frozen and archived, docs rewritten, Sprint 7 after the overhaul
- **Status:** Accepted (2026-10-11, Ronith)
- **Context:** after Sprints 1–6, Ronith reviewed similar tools and HCI research and wants a significant overhaul (docs/research/v2-insights.md): books as folders, a PDF view, a view switcher. The v1 reasoning must stay traceable.
- **Alternatives:** edit DESIGN/PLAN in place with superseded markers; a separate OVERHAUL.md beside the v1 docs. For Sprint 7: run it on v1 before the overhaul, or fold it into the new plan.
- **Rules:**
  - *Traceability:* git tag `v1-marginalia` marks the last v1 commit; `docs/archive/v1/` keeps DESIGN.md and PLAN.md as they were. DESIGN.md (v2) opens with "Principles carried forward", each row linked to its D-number. DECISIONS.md stays append-only; superseded entries say so in their status.
  - *Sprint 7* (prompt review, caching, evals, write-up) runs after the overhaul, so its screenshots and numbers show the v2 product.
  - *Steps:* the overhaul starts with R1 layout shell, R2 books as folders, R3 PDF view (PLAN.md).
- **Why:** an archived v1 reads as a clean "before" for the write-up, and v2 stays one spec that CLAUDE.md points at.
- **Cost we accept:** the 21 h budget is spent; the overhaul needs its own time box (Ronith sets it, PLAN.md). No write-up until it lands.
- **Revisit if:** the overhaul drags past its time box (then cut to R1–R3 and run Sprint 7).

## D22. v2 layout: sidebar, notes, a right pane, and a view switcher (supersedes D14; amends D18)
- **Status:** Accepted (2026-10-11, Ronith)
- **Context:** Ronith wants the notes centred, with the PDF one click away (D14 kept it hidden), and views picked from the top, like the tools he studied.
- **Alternatives:** keep D14 (no PDF view); three fixed columns (passage | notes | chat, rejected in D14).
- **Rules:**
  - *Grid:* a collapsible sidebar (1/6, open/close button) with books as folders; notes (3/6); a right pane (2/6).
  - *Views, from a switcher at the top:* (1) Notes + AI margin, (2) Notes only, (3) PDF only, (4) Chat only. The right pane shows the margin, the PDF or the chat; clicking a source cite opens the PDF.
  - *D6 still holds:* AI text appears only in the margin and chat, never in the notes.
- **Why:** the notes stay central and the book is a glance away, without becoming a reading app.
- **Cost we accept:** a PDF view reopens the "reading app" pull that D14 resisted; the drawer's always-available chat becomes a view switch.
- **R1 details (2026-10-11, Ronith):** an "only" view fills everything beside the sidebar; the reference-text editor and PDF import move under the book in the sidebar; the chosen view and the sidebar's open/closed state are remembered across reloads; on phones the sidebar is an overlay and one pane shows at a time (Claude's assumption, not objected to). Right pane (Ronith): PDF, margin or chat can sit beside the notes, and notes, PDF or chat can each show alone with only the sidebar; the switcher has those two groups (six views).
- **Revisit if:** the right pane feels cramped at 2/6 on a laptop screen.

## D23. PDF in IndexedDB, shown in the browser's built-in viewer (amends D7)
- **Status:** Accepted (2026-10-11, Ronith)
- **Context:** D22's PDF view needs the PDF to survive a reload; localStorage holds ~5 MB, too little for books.
- **Alternatives:** render pages with pdfjs-dist ourselves (about 2 h more; allows highlighting the cited text later); don't store the PDF (re-pick it every session).
- **Rules:** our own ~40-line IndexedDB wrapper beside `core/store` (no new dependency); notes, chat and reactions stay in localStorage (D7). The viewer is an iframe on a `blob:` URL at `#page=N`; a `[p. N]` cite opens that page (MVP, as Ronith specified). Pages go straight to the PDF page for now; matching a cite to the actual text (regex + AI around the cited pages) is a later step.
- **Why:** about 10 lines to display, works offline, and PDFs stay in the reader's browser (D9).
- **Cost we accept:** no highlighting of the cited text on the page; `#page=N` support varies a little between browsers; PDF pages can differ from the paper book's (D13), so links may be off by a few pages until the grounded linking step.
- **Revisit if:** grounded linking needs highlights (then pdfjs rendering), or a browser ignores `#page=`.

## D24. Define and Quiz leave the UI for now (amends D17)
- **Status:** Accepted (2026-10-11, Ronith: "let's remove define / quiz for right now. I don't like their behaviors"); Quiz returns as its own view (D42)
- **Context:** after R1, Define and Quiz switched the right pane to chat and Define pasted a quote into the notes; Ronith dislikes both behaviours.
- **Alternatives:** keep them and only change where replies land (unread dot, or a margin card).
- **Rules:** the toolbar buttons and the page/chat wiring go. `core/commands.ts` (with its tests), `prompts/define.md` and `prompts/quiz.md` stay untouched, so they can return with a better shape. Chat still asks free-form questions; React is unchanged.
- **Why:** fewer controls while the v2 layout settles; nothing about the commands' core logic was wrong.
- **Cost we accept:** no quick definitions or self-quizzing until they come back.
- **Revisit if:** Ronith wants them back (Parking lot has the item).

## D25. Notes are one file in a CodeMirror editor with Obsidian-style live preview (supersedes D18's blocks and D20's block storage)
- **Status:** Accepted (2026-10-11, Ronith: "I want one simple file structure with rendering in line the way that obsidian works rather than having the block setup")
- **Context:** Sprint 6's Jupyter-style blocks render every paragraph except the one being edited; Ronith wants one continuous file that renders as you type, like Obsidian.
- **Alternatives:** one plain textarea with no rendering (~1 h); today's blocks with their chrome removed (~1 h). Live preview was priced at ~5 h in D18 and passed over then.
- **Rules:**
  - *Editor:* CodeMirror 6, the library Obsidian's live preview is built on. New dependencies (approved): `@codemirror/state`, `view`, `language`, `commands` (undo/redo), `@lezer/markdown` (GitHub-flavoured markdown parser; leaner than `@codemirror/lang-markdown`, which pulls in HTML/CSS/JS support). `marked` is removed.
  - *Live preview* (`lib/live-preview.ts`): headings, bold, italics, inline code, strikethrough, links, quotes, bullet lists and `[¶n]` cites render in place; their symbols show only on the lines the selection touches. Decorations never change the text; raw HTML stays text.
  - *Storage unchanged:* the notes stay one markdown string, so store, export and the AI see exactly what is typed.
  - *Margin:* each paragraph with reactions gets a group of cards level with its first line, pushed down past earlier groups (`stackCards`). React acts on the selection or the paragraph at the caret (D18 as first specified).
- **Why:** it is how Obsidian does it, with no change to the data or the AI's input.
- **Cost we accept:** five new packages; links aren't clickable while editing (Obsidian needs Cmd-click too); on phones cards list under the notes instead of under each paragraph.
- **Revisit if:** the editor fights the margin layout, or live preview misrenders common notes.

## D26. Quiet chrome: a minimal frame around the notes
- **Status:** Accepted (2026-10-11, Ronith)
- **Context:** Ronith wants the UI "more minimalistic" after R1.
- **Alternatives:** zero chrome (controls appear on hover or a floating corner control); just restyle today's controls.
- **Rules:** one thin top bar: ☰, the book's title, and a compact switcher (Margin · PDF · Chat, plus a ⤢ toggle that shows the current pane alone) instead of six labelled buttons. The notes toolbar shrinks to React and a ⋯ menu (Export, Reference text). No boxes or borders; hairline dividers only.
- **Why:** keeps every control discoverable while giving the notes the page.
- **Cost we accept:** "Notes alone" moves behind a toggle instead of a labelled button.
- **Revisit if:** the toggle proves hard to find.
- **As built (R1d, 2026-10-11, Ronith: "still not simplified enough"):** one bar instead of a bar plus a toolbar: ☰ · book · status · Margin PDF Chat · ⤢ · React. The ⋯ menu is dropped: Reference text and Export moved under the book in the sidebar, where the book's actions belong. Everything right of the sidebar shares one background; the margin rule is a hairline; card excerpts drop markdown symbols.

## D27. Obsidian's default fonts (amends D20's fonts)
- **Status:** Accepted (2026-10-11, Ronith: "make the fonts match the defaults of Obsidian")
- **Context:** D20 set Literata for the notes and Hanken Grotesk for the AI and interface, loaded with `next/font`.
- **Alternatives:** keep a distinct face for AI text only.
- **Rules:** Obsidian's default stacks: the system UI face (`ui-sans-serif, -apple-system, …`) for notes, AI and interface; the system monospace for code; editor text 16px, line-height 1.5, at most 700px wide and centred; Obsidian's heading scale (1.618, 1.462, 1.318, 1.188, 1.076em). Nothing is downloaded; `next/font` is no longer used.
- **Why:** the notes should feel like the reader's Obsidian vault.
- **Cost we accept:** AI and user text no longer differ by typeface; D6's distinction now rests on colour, the tinted card and its rule.
- **Revisit if:** AI text and notes get confused in real use (then a second face for AI text).

## D28. A light theme by default, dark behind a toggle
- **Status:** Accepted (2026-10-11, Ronith: "a minimalist non-chrome / non-dark option. think white, gray, light blue")
- **Context:** the palette followed the system's light/dark setting, and Ronith uses dark mode; he wants a light, minimal look.
- **Alternatives:** light only; follow the system with a toggle.
- **Rules:** the app opens light (white main area, light-gray sidebar, gray text, light-blue accent; AI cards on a pale-blue wash with a blue rule, so D6's distinction holds). A sun/moon icon in the top bar switches to the dark palette; the choice is remembered with the layout (`core/store` UI state).
- **Why:** light is what Ronith asked for; dark stays one click away.
- **Cost we accept:** the system setting no longer picks the theme.
- **Revisit if:** dark is wanted on by default at night (then "follow system").

## D29. The PDF view uses pdfjs's own viewer with our toolbar (supersedes D23's built-in viewer)
- **Status:** Accepted (2026-10-11, Ronith)
- **Context:** Ronith wants a ChatPDF-like viewer with a floating toolbar: zoom out, reset, zoom in, "1 of N" page box, download, search. The browser's built-in viewer (D23) can't be restyled.
- **Alternatives:** the browser's built-in viewer in an iframe (~0.5 h).
- **Rules:** `pdfjs-dist/web/pdf_viewer` (already installed: no new dependency) renders pages with a selectable text layer; its find controller highlights search matches. Our toolbar drives zoom, page and search. D23's IndexedDB storage stays; a `[p. N]` cite opens that page.
- **Why:** matches the reference design and makes search and later highlighting of cited text possible (D23's revisit condition).
- **Cost we accept:** about 3 h; the pdfjs viewer stylesheet joins the page.
- **Revisit if:** rendering is slow on long books.

## D30. Top bar with icons and labels, ChatPDF-style (amends D26)
- **Status:** Accepted (2026-10-11, Ronith)
- **Context:** Ronith likes ChatPDF's icon top bar.
- **Alternatives:** icons only.
- **Rules:** left: sidebar icon (and, from R3, Upload); middle: the book's title; right: Margin, PDF and Chat as icon + label toggles (the selected one on a light-blue pill), ⤢ alone, theme, React. Icons are inline SVGs in the style of Lucide (ISC licence, credited in the source); no icon package.
- **Why:** labels keep the switcher readable while the icons give it ChatPDF's look.
- **Cost we accept:** a wider bar; on phones the labels hide.
- **Revisit if:** the bar crowds at laptop widths.
- **As built (R3, 2026-10-11, Ronith):** the bar spans the full width above the sidebar, as on chatpdf.com, so toggling the sidebar never moves it; the app name sits at its left; the sidebar's own « close button is gone (☰ does it; on phones the backdrop too). Upload sits after ☰.

## D31. Books: one notes file per book; new, rename, delete; folders before the PDF (resolves Q9)
- **Status:** Accepted (2026-10-11, Ronith)
- **Context:** R2 needs a data model; Ronith also chose to build folders before the PDF viewer.
- **Alternatives:** several notes files per book (e.g. per chapter, ~+1.5 h); create and switch only; PDF first.
- **Rules:** a book holds its title, reference text, one notes file, its chat and its margin threads (and, from R3, its PDF in IndexedDB). The sidebar lists books: "+ New book" asks for a title, a click opens one, titles rename inline, delete asks first. v1's saved state becomes the first book, "My first book". Order: R1e (theme, top bar), R2 (books), R3 (PDF viewer and upload; PDF-by-URL later).
- **Why:** matches "the main notes" in Ronith's insights and keeps the store change small.
- **Cost we accept:** one notes file per book until a later step.
- **Revisit if:** one file per book gets unwieldy for long books.

## D32. A 25K-token cap on the reference text; pick PDF pages to fit it
- **Status:** Accepted (2026-10-12, Ronith: "add a blocker for the time being so that the whole book doesn't get parsed with each use of AI")
- **Context:** R3 fills the reference text from a whole PDF, and every chat turn and reaction sends all of it: a 300-page book is ~150K tokens, ~30¢ a turn on Sonnet 5.5's $2/MTok input (D12's price, to re-check before Sprint 7).
- **Alternatives:** caps of 10K (~2¢/turn) or 50K (~10¢/turn) tokens; block only and trim the text by hand.
- **Rules:** `core/passage` estimates tokens as characters ÷ 4 and caps the reference text at 25K tokens (~100K characters, 2–3 chapters, ~5¢ a turn). Over the cap, React, chat and thread replies are disabled with a message saying the size and how to fix it, and the route refuses the request (`reference_too_long`) before any paid call. When a PDF's text is over the cap, the upload asks which PDF pages to use (prefilled with as many pages from the start as fit); "Choose PDF pages" under the book reopens that choice. The PDF itself still shows in full.
- **Why:** a hard ceiling on cost per turn while grounding stays whole-text, until a better way to send only the relevant parts exists.
- **Cost we accept:** the AI sees only the chosen pages; re-picking pages as the reader moves on.
- **Revisit if:** Ronith's exploration of structured XML and sending only parts of the book (Parking lot) lands, or prompt caching (Sprint 7) makes larger references cheap.
- *Amended (2026-10-14, Ronith: "let's up the pdf page limit to 50 pages"):* the cap is 50K tokens (~200K characters): about 50 pages of a dense book (~1,000 tokens a page), more of a lighter one. Still counted in tokens, not pages, so the cost per turn stays bounded whatever the page density: ~10¢ a chat turn uncached, and each daemon run sends it too. Simple caching (S8.2) is the next step and cuts repeat turns.

## D33. Page links: a free, computed layer from the notes' page references to the PDF (resolves Q10)
- **Status:** Accepted (2026-10-12, Ronith)
- **Context:** Ronith wants each page reference in his notes linked to the right spot in the PDF, like ChatPDF's citations, as a layer above the markdown so the file stays clean. Paper pages and PDF pages differ (D13).
- **Alternatives:** embeddings (Voyage `voyage-4-lite`, $0.02/M tokens after 200M free; new key and route) or Claude ranking nearby paragraphs (~1¢ a reference); Ronith declined anything that costs money for now. Corrections (pin or re-link) declined too.
- **Rules:**
  - *References:* `[p. 42]`, `[pp. 42-43]`, `[PDF p. 7]`, `p. 42`, `pp. 42-43`, `pg 42`, `page 42`, `pages 42-43`, `(42)` right after a closing quote, and `— 42` right after a quote. Not `[¶n]` cites or roman numerals. Each takes the quote before it in its paragraph (or a blockquote above it), else its sentence.
  - *Matching, free only, surest first:* exact quote anywhere in the PDF, the hit nearest the estimate (●); else the paragraph within 3 pages of the estimate covering the most of the reference's word weight, rarer words counting more (◐, at least 35% and two shared words; Claude's proposal, Ronith agreed); else the estimated page (○). Exact hits teach the book's offset (median of PDF page − book page).
  - *A layer:* links are recomputed from the notes and the whole PDF's text as the notes change; nothing is stored in or written to the notes. In the editor each reference is underlined and followed by a marker. Clicking the reference text (Ronith) or the marker opens the PDF at that page and selects the quote (or the paragraph's first words); on the line being edited a plain click on the text places the caret instead, as in Obsidian's live preview, and ⌘/Ctrl-click still opens it.
- **Why:** gives most references an exact or near-exact link at no cost, and keeps the markdown file the reader's own.
- **Cost we accept:** paraphrases only link by shared words (no meaning); a wrong link can't be corrected by hand; links are only as good as the PDF's text layer.
- **Revisit if:** too many ◐/○ links land wrong (then embeddings or Claude ranking, Parking lot), or Ronith wants to fix links by hand.

## D34. Hosted for testers: Vercel + Supabase, staged (supersedes D9; D7 at stage 2; amends DESIGN.md §3)
- **Status:** Accepted (2026-10-12, Ronith); stage 1 live; stage 2 tabled by D35 (2026-10-12, Ronith)
- **Context:** Ronith wants outside testers for feedback: a public URL, a landing page, sign-up and login, and books and notes in a database. Accounts and sync were non-goals (§3), data lived in the browser (D7), and the planned demo was bring-your-own-key with public-domain text (D9).
- **Alternatives:** accounts and Supabase all at once before anyone tests (~10–12 h); accounts with notes in the database but book text and PDFs left in the browser (~7–8 h; a new device loses the book); deploy only, behind an invite code, no accounts (~2 h).
- **Rules:**
  - *Stage 1 (~2 h):* deploy the app as-is to Vercel behind a shared invite code; Ronith's Anthropic key on the server; route size caps (Parking lot) and a global spend ceiling: a dedicated Anthropic Console workspace and key with a monthly spend limit (Ronith, H1: zero code, enforced by Anthropic; a Supabase daily counter was the alternative). Data stays in each tester's browser.
  - *Stage 2 (~8–10 h):* Supabase magic-link sign-in limited to an invite list; a landing page with sign-up and login; every book's title, reference text, notes, chat and threads in Postgres and its PDF in a private Storage bucket, each row and file visible only to its owner (row-level security); a per-account cap of $3/day of AI usage, counted from per-call usage rows (which also feed Sprint 7's cost logging). A tester's existing browser data is offered for import on first login.
  - *Copyright:* each user's books are private to that user; the landing page says to upload only books you own. Book text is still never committed to git.
- **Why:** accounts with hosted data are the only option where a tester's work persists across devices; staging gets feedback in about 2 h instead of 12.
- **Cost we accept:** ~10–12 h before Sprint 7; Ronith pays testers' AI use (up to $3/day each); the app hosts private copies of users' books; `core/store` becomes async.
- **Revisit if:** spend nears the ceiling, testers ask to share books, or a rights holder complains.

## D35. A daily cap of 60 AI replies per browser, in localStorage (tables D34 stage 2)
- **Status:** Accepted (2026-10-12, Ronith)
- **Context:** H1 is live behind an invite code; the only spending ceiling is the Anthropic workspace's monthly limit. Ronith tabled Supabase accounts and storage and asked for a daily cap stored like everything else, in localStorage.
- **Alternatives:** count dollars from each reply's token usage (needs a price table; the router call's tokens aren't reported yet); warn at the cap but keep the AI working; a server-enforced cap (needs a shared store, i.e. a database).
- **Rules:** `LIMITS.dailyReplies` (60, in `core/limits.ts`) AI replies per browser per local day; chat, React and thread replies each count one, when they start (a failed reply counts too). `lib/converse-client` counts every reply under `tertulia-margins:usage` (`{ day, replies }`) and refuses one past the cap (`daily_limit`); at the cap the page pauses React, chat and thread replies with "You've used today's 60 AI replies; they reset at midnight." The count is re-read when a reply starts or ends and when the window regains focus, so a new day reopens the AI.
- **Why:** keeps honest testers from overspending by accident, with no database.
- **Cost we accept:** it stops no one who clears site data, uses a private window or another browser, or calls the route directly; the Anthropic monthly limit stays the real ceiling. Replies vary ~10x in cost with the reference size.
- **Revisit if:** spend nears the monthly limit (then a server-side cap, which needs D34 stage 2's database).

## D36. Obsidian-style list keys from `@codemirror/lang-markdown`
- **Status:** Accepted (2026-10-12, Ronith)
- **Context:** in the notes, Enter after a bullet doesn't continue the list and Tab doesn't indent it, as Obsidian does. Obsidian is closed source, but its editor is CodeMirror 6, like ours (D25).
- **Alternatives:** our own ~60 lines for continue, end and indent.
- **Rules:** add `@codemirror/lang-markdown` (the official CodeMirror package, same family as our other `@codemirror/*` dependencies) for its list commands; Tab and Shift-Tab indent and outdent a list item with `@codemirror/commands` (already installed). Live preview keeps parsing with `@lezer/markdown` (D25).
- **Why:** battle-tested list editing for one small dependency, against edge cases (nested numbering, task items, quotes) we'd otherwise rediscover.
- **Cost we accept:** one more dependency, which brings `@codemirror/lang-html` (with its CSS and JavaScript parsers) and `@codemirror/autocomplete`: ~190 KB more minified JavaScript (measured at T2; Claude first described it as small). The notes now parse with lang-markdown's GFM language, which also reads `~sub~`, `^sup^` and `:emoji:` (shown as typed).
- **As built:** `lib/list-keys.ts`; Obsidian's renumbering added on top (an indented ordered item restarts at 1, an outdented one continues the list above), and Backspace on a bare marker removes it outright.
- **Revisit if:** it fights live preview's own parse or the page's load time suffers (then our own ~80 lines, now that the behaviour is pinned down).

## D37. Daemons replace margin reactions: automatic short nuggets, picked by a reviewer (supersedes D18's marginalia and D20's routed reactions)
- **Status:** Accepted (2026-10-13, Ronith)
- **Context:** Sprint 8 planning. The React button felt like the chore D18 warned of, and reactions ran a paragraph long. Ronith's references: Maggie Appleton's daemons (LM Sketchbook), the Obsidian "AI Editors" plugin, merryvj/llm-daemons.
- **Alternatives:** a button per daemon; one button running both daemons; a run every ~4 s pause, with each daemon drafting in its own call and a full-price reviewer (~3 calls per 10 lines); counting runs against D35's 60-reply cap; keeping old cards read-only or hidden; custom daemons in this MVP; caching later in Sprint 7.
- **Rules:**
  - *Definition:* a daemon is a named companion in the margin with one job. It reacts to the reader's notes in its own voice, using the book as its evidence. It never writes into the notes, and its text is always marked as its own.
  - *Persona × action:* a daemon is a persona (name, colour, voice/tone, personality, free-text prompt) combined with one action from a fixed, app-owned list (Ask, Counter, Evidence, Connect, Define, Quiz, …). The action owns the citation rule, the context and the reply shape, so a persona can't skip `[¶n]`. Daemons are rows in a data table.
  - *Two defaults:* **The Author** (Connect: answers the note in the book's voice, first person, labelled "in the book's voice", every claim cited, "the book doesn't say" when silent) and **The Devil's Advocate** (Counter: the strongest opposing reading, plain and short, cited when it uses the text).
  - *Nuggets:* a reply is 1–2 sentences or 1–2 questions, the most interesting point first, cited `[¶n]` (the cite opens the PDF page), so the reader can scan and decide whether to engage.
  - *Automatic cadence:* a run starts after an idle gap (~20–30 s) once 10+ lines of the reader's own words are new or substantially changed since the daemons last saw them. Quotes copied from the book, page markers and headings don't count; unchanged paragraphs are never re-sent.
  - *Draft, then review:* one panel call drafts a candidate from each daemon, or "pass", in one structured reply. A small separate reviewer call (no book, only the candidates, the excerpt and the cited paragraphs) shows the single best one, or none if nothing is significant. Floor: if ~15 lines have gone by with no card, the reviewer must pick when there is a candidate. Runners-up are saved per book and fill the floor later without a call, while their text is unchanged. All numbers go in `core/limits.ts`.
  - *Cap:* daemons get their own daily run cap (separate from D35's chat replies), starting at 40 runs per browser per day; at the cap they pause quietly and chat keeps working.
  - *Caching (simple):* one cached base prefix (system prompt + the whole reference text) shared by chat and the daemon panel call; each call's own instructions, notes and question come after it.
  - *Removed:* the React button and its right-click menu, the router call and the three reaction kinds, and thread replies. Saved margin cards and threads are deleted from each book on load.
  - *Amended (2026-10-13, Ronith, after trying S8.2b: "there should be some indication or signal that the daemons exist"):* a panel at the top of the margin names the daemons (colour dot and name), shows one line of status ("Listening: 4 of 10 new lines", "Reading your notes…", "Nothing to add this time", "Paused: …", the daily cap) and has a **React to notes** button. The button runs the daemons now, on the new lines (however few) or, with none, on the most recent ~10 lines; the reviewer must pick if any daemon drafted something. It counts against the daemon cap. Automatic runs stay as they were. *Amended again (2026-10-14, Ronith: "I want the react button to process all the notes, not just the last 10 lines"):* the button sends all the notes as the excerpt; the reviewer still shows one card. A run on long notes sends them twice (as `<notes>` and as the excerpt), up to ~25K tokens on the 50K-character cap.
  - *Later (Parking lot):* "Elaborate" and replies that open a thread on a nugget; custom daemons (a "New daemon" form); Socratic and Researcher/Recommend daemons (Recommend needs D5 reopened); other inline AI actions on a selection.
  - *Prompts:* Claude drafts `prompts/daemon-*.md` and the reviewer prompt from the pushback and connection prompts (extends D19); Ronith refines them before merge.
- **Why:** the reader writes and the margin quietly fills with the one point worth reading, in a voice that says who's speaking. Generating is separated from showing, so cost scales with how much the reader writes rather than how often they pause.
- **Cost we accept:** testers' existing reactions are deleted. Automatic runs spend without a click; the daemon cap and the Anthropic monthly limit are the ceilings. The panel call blends both personas in one reply, so their voices may drift together. "Substantially changed" and "significant" are tuned by feel at first. The Author speaks in the first person as a real person, so the eval must test notes about things the book never discusses.
- **Revisit if:** the voices blur (then one draft call per daemon); the margin feels too empty or too noisy (tune the thresholds); spend grows faster than notes do; the Author invents views (then third person: "the book argues…").

## D38. AI cites pages, not paragraphs, and only when it quotes or points at a passage; daemons get their own role (amends D4, D13, D37)
- **Status:** Accepted (2026-10-13, Ronith)
- **Context:** reviewing S8.2a, Ronith found the `[¶n · PDF p. 2]` cites cluttered and ugly and the daemon prompts basic. He wants a plain page number the reader can click to see the cited section highlighted in the PDF, and prompts that follow current agent-prompting practice.
- **Alternatives:** the model keeps citing `[¶n]` and the UI shows only a page link (keeps paragraph-level checks); a page cite on every claim; asking for page markers before the AI works; `(p. 12)` as the written form; daemons keep chat's `system.md` with nugget rules in the user turn.
- **Rules:**
  - *What the model sees:* the reference text split at its page markers into `<page n="…">` blocks inside `<book_text>`, placed first, before any instructions (long-context practice; also the prefix every call shares, for caching). Text with no markers is sent unsplit. Paragraph labels `[¶n]` are gone.
  - *When to cite:* when AI text quotes the book or points to a specific passage, it cites the page as `[p. N]` (or `[pp. N–M]`), N being the `<page>` it came from. General remarks need no cite. Unsupported claims still say "not in the text".
  - *Check (`checkCitations`):* every quote of three words or more is checked: with a cite in its sentence, it must be on that page (or run into the next one); without a cite, it must be in the book or in the reader's notes. Codes: `page_not_found`, `quote_not_on_page`, `quote_not_in_text`. Quotes of the reader's notes stop being false alarms.
  - *What the reader sees:* a cite renders as a small "p. 12" link; a click opens the PDF at the matching page with the quote selected, found the same way as page references in the notes (D33: exact quote, then word overlap, then the page). Old messages with `[¶n]` render as before.
  - *Daemon role:* a daemon run's instructions are their own system prompt (`prompts/daemon-role.md`), after the book; chat, React and commands keep `system.md` there. Daemon and reviewer prompts follow Anthropic's prompting guidance: say why, show 3–5 canonical examples, say what to do, "think it through before you answer" for JSON on reasoning tasks.
  - *Prompts:* Ronith's `system.md`, `define.md` and `quiz.md` change only where they name `[¶n]`, as a diff for his approval.
- **Why:** a page is what a reader of a paper book looks for, and a click shows the exact words; the model reads page numbers from the text rather than guessing them, so D13's protection holds.
- **Cost we accept:** a page holds several paragraphs, so a cite is checked less precisely than a `[¶n]` was; claims without a quote aren't checked at all; a book typed with paper page markers and a separate PDF links through D33's estimate when a cite has no quote.
- **Revisit if:** cites land on the wrong page often, or replies stop citing what they quote.

## D39. Daemons are for extending the reader's thinking, not checking it; a third daemon brings outside knowledge (amends D37, D5)
- **Status:** Accepted (2026-10-14, Ronith)
- **Context:** trying S8.2b, Ronith found the daemons "more nit picky than insightful… making technical points that don't extend the conversation". D37 defined what a daemon is but not what the margin is for, and the drafts answered "checking the notes against the book": both jobs leaned to correction (Connect's "the passage that sets it right"), the examples were all fact-checks, every remark was pushed to quote a page, the reviewer ranked tension first, and the daemons answered only the latest ~10 lines of a 4-page test book.
- **Alternatives:** reframe both daemons, book-only (~2 h); swap the Devil's Advocate for a generative Questioner as a default (~3 h); allow outside knowledge for all daemons (~3–4 h).
- **Rules:**
  - *Purpose:* a daemon's remark extends the reader's thinking: a connection they haven't made, a pattern, a reading they haven't weighed, or a question worth carrying forward. Correcting a misreading is no longer a goal in itself; it earns a remark only when the correction opens something up.
  - *Kinds of connection (all four, Ronith):* across the book (a passage that echoes, sets up or complicates the note); to the reader's earlier notes (their own thread of thinking, not just the latest excerpt); open questions (worth carrying forward, not answered on the page); beyond the book (the third daemon).
  - *The Author (Connect):* reframed around connections across the book and to the reader's earlier notes; the "set it right" rule goes.
  - *The Devil's Advocate (Counter):* offers the strongest *other reading* of what the reader noticed, not a fact-check of it.
  - *A third daemon (outside knowledge):* connects the note to other works, history and ideas. Its remarks are labelled "beyond the book" on the card. It names the work, author or idea and paraphrases; it never quotes an outside work, since such a quote can't be checked. Its remarks about this book still follow D38 and `checkCitations`, which also drops any remark quoting another work (the quote is in neither the book nor the notes). It is **The Scholar** (Ronith, 2026-10-14), teal `#2f7a6b`, action **Widen** (`action-widen.md`, `daemon-scholar.md`); it never reveals what happens later in this book beyond `<book_text>`, and passes when unsure a work or fact is real.
  - *Grounding (D38, eased):* cite a page when quoting or pointing at a passage; a quote is used only when the wording is the point, so an interpretive remark needs no quote.
  - *What to answer (added from Ronith's poioumenon example, 2026-10-14):* the reader's own claims, hunches, questions and reactions, never reference material from any source (copied quotes, looked-up definitions, research notes, summaries); with several claims, the one with the most at stake; never "you note…" unless the notes say it. The anchor is the key phrase of the claim, which the margin highlights on click.
  - *Reviewer:* ranks "opens a line of thought the reader will want to follow" first; a correction ranks only when it does that; sets aside remarks on reference material and remarks that put words in the reader's mouth; judges a `beyond_the_book` candidate on specificity, not on the cited pages. **React to notes** still always shows a card when any daemon drafted one (Ronith kept it, 2026-10-14).
  - *Examples:* the role prompt's examples show remarks that extend a note (connection, other reading, open question, outside link), with at most one correction.
  - *D5:* outside knowledge is allowed for this daemon only, labelled; chat and commands stay book-only.
  - *Prompts:* Claude drafts the changes as diffs to the daemon prompts (D19, D37); Ronith refines before merge. Tested on a full public-domain book, not the 4-page PDF.
- **Why:** every cause of the nit-picking was in the framing, so reframing fixes it cheaply without losing the quote check; outside knowledge is the one kind of connection the book can't give, so it gets its own clearly labelled voice rather than loosening grounding for all.
- **Cost we accept:** the third daemon's claims about other works aren't verified and may be wrong or invented; the label is the only guard. The panel call drafts three remarks, so it costs a little more and the voices may blur more. Fewer remarks carry a checkable quote.
- **Revisit if:** the outside daemon cites works or facts that don't exist (then add a check or a search tool, S8.4); remarks turn vague without quotes; three voices blur (one call per daemon).

## D42. Quiz: a view where the reader tests themselves, written by a quiz agent (supersedes the /quiz command of D17; amends D24)
- **Status:** Accepted (2026-10-14, Ronith)
- **Context:** Ronith wants self-testing built into the app, like Claude's own quiz interface: "the top of quiz is to enable users to test themselves on their understanding of content". D24 had taken the old /quiz command out of the UI.
- **Alternatives:** keep the old command beside the new quiz; keep the quiz for this session only, or keep a history of past quizzes; multiple choice only, or true/false too; two sub-steps (agent, then view) or one.
- **Rules:**
  - *Where:* a **Quiz** view in the top bar between Margin and PDF; beside the notes or alone, like the others.
  - *Setup:* topics as checkboxes (one or more): words defined in the notes, words from the book, key concepts from the book, key concepts from the notes; 1–10 questions; easy, medium or hard; a style: multiple choice (5 options, the default), true/false, or mixed (Ronith: "let the user select the style… default should be 5-option multiple choice"); **Start**.
  - *Too little material:* checks the app can make without a call (no topic picked, no notes for a notes topic, no book text for a book topic, reference over the cap) answer at once; the quiz agent judges the rest and, when the material can't support the request, says why specifically (e.g. "your notes define 3 words: ask for 3 questions or add a topic"), and no quiz starts.
  - *The agent:* one call, after the book (D38), with its own role prompt (`prompts/quiz-maker.md`, Claude drafts, Ronith refines) and JSON output (structured outputs): a verdict, feedback, and questions each with choices, the right one, and why each choice is right or wrong. Our code, not the model, shuffles multiple-choice options, and checks each question: the right number of choices, exactly one right, no duplicates, the right answer not conspicuously the longest, quotes passing `checkCitations`. Failing questions are replaced by one more call; if still short, the quiz runs with fewer and says so. One quiz counts as one of the day's AI replies (D35).
  - *Taking it:* "Question 2 of 10" and the score so far ("1/10"); picking a choice locks it and shows whether it was right, why, and why the right answer is right; Next; at the end, a review of every question, the reader's answer, the right one and the explanations; New quiz. Page cites open the PDF (D38).
  - *Saved:* the current quiz (setup, questions, answers, position) is saved with the book, so a reload or a book switch resumes it; no history of past quizzes.
  - *Old /quiz:* the `quiz` command row and Ronith's `prompts/quiz.md` are removed (he approved); Define stays as D24 left it.
  - *Built in one step* (Ronith).
- **Why:** self-testing is a different act from conversation, so it gets its own view and a structured flow rather than chat; JSON lets our code own the parts the model gets wrong (answer position, giveaway lengths, invented quotes).
- **Cost we accept:** each quiz sends the whole book (up to the 50K cap) plus a long JSON reply; explanations about words or ideas beyond a quote aren't checked; no history of past quizzes.
- **Revisit if:** quizzes feel repetitive or off-topic, the length check rejects too many questions, or Ronith wants a history.
- *Amended (2026-10-14, Ronith: "when I click on the same things… I often get the same or very similar questions"):* variety, two of four proposals. Each book remembers its last 30 questions (`QuizState.asked`) and sends them with the next quiz as `<already_asked>`, not to be repeated or rephrased; our code gives each question an angle at random (cause, consequence, motive, comparison, turning point, detail in context; none repeated until all are used) in `<angles>`. Not chosen: a code-rotated focus on pages not yet quizzed, a "Pages __ to __" field. A progress bar shows while the quiz is written (an estimate: the call reports no progress).

## D43. Quiz topics: two groups, short names, three new topics (amends D42)
- **Status:** Accepted (2026-10-14, Ronith)
- **Context:** after trying the quiz ("the best feature yet"), Ronith asked for better topic names than his first ideas and for other things to quiz on. D5 still holds: topics come from the book or the reader's notes.
- **Alternatives:** rename and group only; rename and add about nine topics (plot, themes, craft too), at the cost of overlap.
- **Rules:**
  - *From the book:* **Vocabulary** (words the book uses), **Big ideas** (themes, arguments, turning points), **Characters** (who's who, motives, relationships; new), **Who said it?** (match a line to its speaker; new: the line is quoted exactly with its page, so `checkCitations` verifies it).
  - *From my notes:* **My vocabulary** (words I've defined), **My ideas** (the claims and connections I made), **Check my reading** (new: does the book back up what I wrote? Supported, contradicted, or not settled by the text).
  - The old ids stay (`book-terms`, `book-concepts`, `notes-terms`, `notes-concepts`) so saved quizzes load; only labels change.
  - The length check that rejects a giveaway right answer now also needs the right answer to be 20+ characters longer than the average, so short answers like names ("Sir William Lucas" against "Jane") aren't rejected for length.
- **Why:** each new topic tests something the first four didn't (who's who, exact words, whether a reading holds) without overlapping them; grouping by source makes the list scannable.
- **Cost we accept:** seven checkboxes instead of four; "Big ideas" and "Characters" can overlap on a character's motive.
- **Revisit if:** Ronith rarely picks a topic, or two topics keep producing the same questions.
- *Amended (2026-10-14, Ronith):* **Check my reading** is removed ("that seems more like a Daemon task"; Parking lot). **My ideas** takes the reader's notes as true: the right answer is the one the notes hold, and questions never test whether the book agrees. With **Big ideas** and **My ideas** both ticked, the setup warns that where the notes and the book disagree, a question's answer depends on which topic it came from (each question shows its topic). A saved setup with Check my reading drops it.

## D44. Quiz styles: fill in the blanks (dropdowns) and free response (graded by an agent) (amends D42)
- **Status:** Accepted (2026-10-14, Ronith)
- **Context:** Ronith wants two more styles: fill in the blank and free response, where "an agent should offer quick one line feedback on why it is right or wrong or why it is an incomplete answer missing something critical".
- **Alternatives:** blanks typed and matched by code, by the grading agent, or both; partial credit as half a point; the grader also given the whole book; grading free of the daily cap.
- **Rules:**
  - *Styles:* Multiple choice (default), True / false, Fill in the blanks, Free response, Mixed (any of the four).
  - *Fill in the blanks (Ronith: "a dropdown… 2-3 fill in the blanks per question and then explanation based on what they chose"):* one sentence with 2–3 blanks, each a dropdown of 4 options, one right; each option says why it is right or wrong. The reader fills every blank, then checks; the question is right only when every blank is. Our code checks each blank like a multiple-choice question and shuffles its options.
  - *Free response:* the quiz agent also writes a model answer and the key points a full answer needs, with page cites. The reader writes an answer and submits it (locked, like a choice). A grading call (`prompts/quiz-grader.md`, Claude drafts) sees the question, the model answer, the key points and the pages they cite, not the whole book, and returns right, partly right or wrong with one line of feedback naming what is wrong or missing. Then the model answer and key points show.
  - *Score:* "partly right" doesn't score (Ronith); its feedback still shows.
  - *Daily cap:* each grading counts as one of the day's AI replies (Ronith). A grading that fails (network, the cap) can be retried or skipped; skipped counts as not right. A reload mid-grading offers to grade again.
- **Why:** dropdown blanks keep grading instant and free while testing exact wording in context; free response tests recall without cues, so it needs judgement, and a grader grounded in the model answer and its pages stays cheap and consistent.
- **Cost we accept:** a grader without the whole book may mark down a right answer the model answer didn't foresee; a 10-question free-response quiz uses 11 of the day's 60 replies.
- **Revisit if:** graders mark good answers wrong (then the whole book, once cached), or the cap bites.
- *Amended (2026-10-14, Ronith: "the mixed button looks weird… convert this to check box style… default selection be multiple choice"):* styles are checkboxes, one or more; ticking several mixes them (the agent uses each at least once when there are enough questions); "Mixed" is gone. Multiple choice is ticked by default, and difficulty defaults to Medium. A setup saved with the old single style loads as checkboxes ("mixed" ticks all four).

---

## D45. Cite pills: page references and AI cites as coloured pills, ChatPDF-style (amends D33, D38)
- **Status:** Accepted (2026-10-15, Ronith)
- **Context:** Sprint 9. Page references in the notes were a dotted underline plus a ●/◐/○ marker (D33), and AI cites a small gray "p. 12" (D38). Ronith wants them wrapped in a bubble like ChatPDF's "↗ 2", still coloured by match strength.
- **Alternatives:** pills in the notes only (AI cites unchanged); pills everywhere with AI cites one neutral colour (no up-front matching).
- **Rules:** every page reference in the notes and every page cite in AI text (chat, margin cards, quiz explanations) shows as a rounded pill, "↗ p. 42": blue for an exact quote, light blue for word overlap, gray for page only. AI cites are matched when their message renders (same free matching as the notes, once per message). The ●/◐/○ markers go. On the notes line holding the caret the raw `[p. 42]` shows, as live preview does for other markup. Decorations only: the markdown never changes.
- **Why:** the colours only mean something if they mean the same thing everywhere.
- **Cost we accept:** each AI message with cites runs the page matching once when it renders (cheap word matching, no API call).
- **Revisit if:** long chats render slowly, or the pills crowd dense notes.
- *Amended (2026-10-15, Ronith: light blue "doesn't look that different from dark blue"):* a word-overlap pill is slanted blue-and-white pinstripes with a thin blue outline instead of light blue.

---

## D46. Quote autocomplete: ghost text from the book once 4 typed words match (amends D36)
- **Status:** Accepted (2026-10-15, Ronith)
- **Context:** Sprint 9. Transcribing a quote from a paper book means typing it all; the book's text is already in the browser. Ronith: as he types "charisma is the power of..", show the likely next words from the book, Tab to accept and see the next ones, ignoring PDF formatting (doubled spaces, hyphens).
- **Alternatives:** only inside quote marks or a `>` blockquote, from 3 words; anywhere from 3 words.
- **Rules:** once the last 4+ words before the caret match the book exactly (normalized like `checkCitations`: case, curly quotes, whitespace), faded ghost text shows the next ~5 words, stopping at punctuation. The source is the PDF's whole text, else the reference text; line-break hyphens are joined and runs of spaces collapsed. If the book continues the phrase more than one way, only the words all matches share show. Tab accepts and the next words show; Esc dismisses; Tab indents a list item (D36) only when no ghost shows. Plain code in `core/`, no AI call, no new dependency. Ghost text is a decoration until accepted; accepted words are typed by the reader's keypress, so they are the reader's own (D6 holds).
- **Why:** Ronith's own example has no quote mark, so a quotes-only trigger misses the case he described; 4 exact words almost always means quoting.
- **Cost we accept:** it may fire on a common phrase in the reader's own writing (Esc, or the S9.3 toggle).
- **Revisit if:** it fires on the reader's own thoughts often, or misses quotes PDF text garbles ("c aprice").

---

## D47. A settings gear: quote autocomplete, page links and theme (amends D26, D28)
- **Status:** Accepted (2026-10-15, Ronith)
- **Context:** Sprint 9. Ronith wants a gear at the top right to switch quote autocomplete (D46) and the notes' page links (D33, D45) on and off. The bar ended in a moon/sun theme button (D28).
- **Alternatives:** the gear holds only the two feature toggles and the moon button stays.
- **Rules:** a gear at the right end of the top bar opens a small menu with three switches: Quote autocomplete, Page links, Dark theme; the moon/sun button goes. Saved per browser with the view (`UiState`), not per book; both features on by default, light theme by default (D28). Page links off: the notes' page references show as plain text (no pills, no clicks, no matching); AI cites stay clickable pills, as they are the AI's evidence. Autocomplete off: no ghost text, Tab only indents.
- **Why:** one quiet place for rarely changed settings keeps the bar to one icon (D26, D30).
- **Cost we accept:** switching theme takes two clicks instead of one.
- **Revisit if:** testers look for the theme switch and don't find it, or the menu grows past a handful of switches.

---

## D48. Traces: a readable timeline of every reader action and agent output
- **Status:** Accepted (2026-10-17, Ronith)
- **Context:** daemon quality was judged by eye with no record of what each run saw and said (harness scorecard A4 = 2). Ronith wants traces that are "easy for a human to read and follow along", for eval runs and for real use: notes typed, chat, quiz, and what each agent answered.
- **Alternatives:** where live traces go: each browser only, with an export button; localhost only; a server store (chosen). Stores: Vercel Blob (chosen), Supabase Postgres, Upstash Redis.
- **Rules:**
  - *Events* (`core/trace.ts`): session start, book open/create/rename/delete, view and setting changes, notes edits (lines added and removed, after a 4 s pause or before a book switch), PDF added and pages opened, chat question and full reply with token counts and each quote check, daemon runs with every draft and its fate (passed, dropped and why, runner-up, shown), anchor fallback, word count and tokens for panel and reviewer, runner-ups promoted, card clicks and dismissals, quiz start, questions written, each answer, grades, score.
  - *Never traced:* book text. Titles, page numbers, the reader's own words and AI output only.
  - *Readable:* `renderTrace` writes markdown: one entry per event, who acted (Reader, Chat, Daemons, Quiz agent, Quiz grader), what happened, and the text involved, grouped by book.
  - *Where:* the browser posts batches to `/api/trace` (every 5 s and when the tab hides). On localhost (`next dev`) each session goes to `.scratch/traces/<day>/<browser>-<session>.{jsonl,md}`, rendered as it grows. Hosted, with a private Vercel Blob store connected (`BLOB_READ_WRITE_TOKEN`), each batch is a blob under `traces/<day>/<browser>/<session>/`; `npm run traces` downloads and renders them into `.scratch/traces/hosted/`. With neither, the route stores nothing.
  - *Dependency:* `@vercel/blob` (Ronith approved).
  - *Consent and deletion:* not built; Ronith tells testers directly (2026-10-17).
  - The daemon route's `daemons` event now carries `drafts` (every draft and its fate) so the trace can show them.
- **Why:** the harness rubric's first P1 gap: without traces nobody can read failures, count them or tell which stage caused them (evals FAQ: error analysis first).
- **Cost we accept:** testers' notes and the AI's replies are stored on Vercel; tracing adds a request every few seconds of activity; traces drop silently on failure.
- **Revisit if:** traces get large, testers object, or a tester asks for their data to be deleted.

## D49. Two example books for every visitor
- **Status:** Accepted (2026-10-17, Ronith)
- **Context:** a visitor's first screen was an empty book, so it was hard to see what the app does. Ronith wants examples with notes and daemon cards to appear for everyone.
- **Alternatives:** read-only examples rebuilt on every visit; editable and restored if deleted; editable, seeded once, with a restore action (chosen). For Weber's text: notes and cards only; the German original; a free translation; the Gerth & Mills translation (chosen: Ronith has the publisher's permission for this educational, non-commercial use).
- **Rules:**
  - *Books:* "Example: Politics as a Vocation" (Gerth & Mills, Oxford University Press 1946, PDF from Ronith; his own notes; his Author card) and "Example: Pride and Prejudice (ch. I–VIII)" (Project Gutenberg #1342, typeset to a 48-page PDF; sample notes labelled "written for this example, not a real reader's"; three real daemon cards from one run each). Files in `public/examples/` (`<name>.json`: title, notes, cards, chat; `<name>.pdf`).
  - *Seeding:* once per browser (`tertulia-margins:examples`); the reference text comes from each PDF with the reader's own import; the notes count as already read, so the daemons answer only what the visitor adds; a first visit opens the Weber example.
  - *Editable:* ordinary books; **Restore example books** in the settings gear (D47) puts them back as shipped (after a confirm) and moves them back to the top.
  - *Order (Ronith, 2026-10-17):* Pride and Prejudice above Politics as a Vocation, both above the reader's own books, re-ordered on every load (`examplesFirst`) so browsers seeded earlier catch up; a first visit still opens Politics as a Vocation (real notes).
  - *CLAUDE.md's book-text rule:* these two are the exception: public-domain text and the permitted Weber translation live in the public repo and site.
- **Why:** a visitor sees the whole loop (notes, cards in the margin, page links into the PDF) before writing a word.
- **Cost we accept:** ~1 MB of PDFs fetched on a first visit; the Weber permission must cover the public GitHub repo as well as the site; the P&P cards are a snapshot of one run.
- **Revisit if:** the permission is limited to the site (then serve the Weber PDF from a store, not the repo), or Ronith's own P&P notes replace the sample notes.

---

## D50. Show/Hide reactions, and new cards that shimmer in
- **Status:** Accepted (2026-10-17, Ronith)
- **Context:** Ronith wants control over when the margin speaks: a toggle at the top of the margin, nothing running in the background when it's off, and new reactions that arrive rather than pop in.
- **Alternatives:** the toggle only hiding cards while runs continue; no delay before a card shows; a third trigger, reading any new content after 30 minutes however little (built, then dropped by Ronith the same day: "the 10 lines quota and react notes button are good enough").
- **Rules:**
  - *Toggle:* **Hide reactions / Show reactions**, first in the margin's panel, remembered per browser (`UiState.reactions`, on by default). Hidden: the cards and their highlight disappear, **React to notes** goes, and the daemons do nothing: no wait timers, no runs, and a run already out is cancelled. Showing them again resumes after the next pause.
  - *When they read:* unchanged from D37: 10 new lines of the reader's own and a 25 s pause, or **React to notes**.
  - *Shimmer:* a new card (from a run or a saved runner-up) shows as a shimmering placeholder in its place for a random 1–2 s, then fades in; the screen-reader announcement waits for it. Cards already there on load show at once. Reduced motion: no animation, same delay.
- **Why:** the reader decides whether the margin is live; a short wait signals that someone is responding.
- **Cost we accept:** the delay adds 1–2 s to every new card.
- **Revisit if:** testers miss the toggle, or short notes never get a reaction because they don't reach 10 lines.

---

## D51. One margin without repeats: sentence anchors, sparse sections, several cards a run (amends D37, D39)
- **Status:** Accepted (2026-10-17, Ronith)
- **Context:** Ronith saw the Author make the same point twice, reworded and anchored on different words ("You contrast politics with corporate hierarchy… [p. 15]"). He wants no repeats, highlights large enough that two cards rarely overlap, and after he dismisses cards, a run (10 lines or **React to notes**) that reacts again wherever the notes have few remarks. Using dismissals as feedback is a later sprint.
- **Alternatives:** a prompt rule only (unchecked); an LLM check for repeats (a call per run); anchors widened to the paragraph (too coarse for bullet notes).
- **Rules:**
  - *Repeats, checked in code:* `isSameRemark` counts content words (4+ letters, no stopwords, page cites ignored): the same remark if 60% of the shorter one's words are shared, or 40% when both cite the same page. A draft that repeats a card in the margin is dropped (`repeats_margin`), one that repeats another draft of the same run too (`repeats_draft`); a runner-up that repeats a card is never promoted, and `afterRun` skips a pick that repeats one.
  - *The margin goes with each run:* the cards shown are sent as `<margin>` in the panel's turn; the prompt says never to make a point already there and to aim at parts of the excerpt no remark answers, newest first.
  - *Anchors:* widened in code to the whole sentence that holds them (`sentenceAround`: up to . ! or ? and a space, or the line's end; no list marker; at most 400 characters).
  - *Sparse sections:* a run also reads every paragraph with a line of the reader's own that no card's anchor covers (dismissed cards leave lines uncovered). Only new lines start a run (10, as before); this amends D37's "never sweep the backlog": a book's existing notes are still marked read, but their uncovered paragraphs ride along with the next run.
  - *Several cards a run:* each daemon may draft up to 2 remarks, on different parts; the reviewer picks up to `LIMITS.daemons.maxCardsPerRun` (3), best first, as `picks`; our code keeps them on different words (no overlapping anchors). Each new card shimmers on its own 1–2 s timer (D50).
  - *Prompts:* `daemon-role.md` and `daemon-reviewer.md` gain the margin and several-picks rules (drafted by Claude; Ronith refines).
- **Why:** repeats and overlapping highlights make the margin feel like one voice talking in circles; code can catch a reworded repeat for free and every time.
- **Cost we accept:** the word-overlap test can miss a repeat that shares few words, or drop two genuinely different remarks about the same page; runs read more of the notes (more input tokens) once many paragraphs have no card.
- **Revisit if:** repeats still get through (then an LLM judge in the eval, or embeddings), or runs get slow or costly on long notes.

## D52. Quotes the reader takes from the book link exactly: footnote marks dropped, matching across breaks (amends D33, D46)
- **Status:** Accepted (2026-10-17, Ronith)
- **Context:** a quote Ronith pulled in whole with autocomplete showed as a partial (word-overlap) match. Two causes: (1) the PDF import read a raised footnote mark ("fixed.³²") as a line of its own, which looked like an indented new paragraph, split the sentence and left "32" in the text, so autocomplete offered "…for something 32 much more fixed."; (2) page links matched a quote exactly only inside one paragraph, while autocomplete reads the whole text as one stream, so the two disagreed whenever a quote crossed a paragraph or page break.
- **Rules:**
  - *Import:* a 1–3 digit item in smaller type (under 80% of the body text's height), raised above the baseline of the body text it follows, is a footnote mark and is dropped before lines are formed. On Ronith's PDFs: 216 marks and 202 false paragraph breaks gone from one paper, 8 and 7 from Weber; Pride and Prejudice unchanged.
  - *Exact match:* on a key of letters and digits only (line-break hyphens joined, bare 1–3 digit numbers dropped), over the whole PDF text as one stream, so spacing, punctuation, quote marks, paragraph and page breaks and footnote numbers an older import left in a quote can't stop it; the hit is the paragraph the quote starts in. A key under 12 characters isn't placed. The PDF view searches for the quote without footnote numbers.
- **Why:** whatever autocomplete offers from the book should always link as exact; both now read the text the same way.
- **Cost we accept:** a book whose real text has superscript-sized numbers (rare) loses them; a reference text imported before this keeps its footnote numbers until the PDF is imported again (page links and autocomplete use the PDF's text read fresh, so they're fixed at once).
- **Revisit if:** a quote that's really in the book still shows as overlap.

---

## D53. React to notes reads the bare parts of the notes in sections, all at once (amends D37, D51)
- **Status:** Accepted (2026-10-18, Ronith)
- **Context:** with D51 a run could show up to 3 cards. Ronith asked why not more when the notes justify it. One panel call can't draft many good remarks (each daemon drafts at most two, voices blur, the output budget is shared), so more cards need more calls.
- **Alternatives:** raise the cap and let one call draft more (quality drops as the count rises); cover the notes in batches (chosen); batches spread over the next automatic runs.
- **Rules:**
  - *Only on React to notes.* Automatic runs (10 new lines and a pause) stay one call, up to 3 cards.
  - *Sections:* the parts of the notes with a line of the reader's own that no card answers, as whole paragraphs, or runs of lines when a paragraph is long, packed into sections of about 12 of the reader's own lines (`LIMITS.daemons.sectionLines`); the most recent 4 (`maxSections`). With every line answered, one run over all the notes, as before.
  - *Runs:* one panel call (and reviewer) per section, all at once; each may show up to 3 cards; the first must show something. Each run's cards land when it finishes; one that repeats a card another section has just added is dropped (`afterRun`). The panel's status reads "Reading your notes in 4 sections… 2 done."
  - *Cost and caps:* each section is a paid call sending the book and counts as one of the day's 40 daemon runs (D37), so a press costs up to 4 runs, ~20–40¢ on Weber until caching. Traces label each run "section 2 of 4".
- **Why:** each call stays small and sharp, so quality holds while coverage grows; running them at once keeps a press as fast as one run (~8 s live).
- **Cost we accept:** sections run in parallel, so two can draft the same point before either is in the margin; the merge drops exact-enough repeats but not every overlap. A press over long notes uses several of the day's runs.
- **Revisit if:** presses feel slow or costly (then prompt caching first), or sections still produce near-repeats.

---

## Template

```
## Dn. <title>
- **Status:** Open | Provisional | Accepted | Superseded by Dm  (date, who)
- **Context:** what forced the decision
- **Alternatives:** A; B; C
- **Why:** the deciding trade-off, in one or two sentences
- **Cost we accept:**
- **Revisit if:**
```
