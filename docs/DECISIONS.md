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
- **Status:** Provisional (2026-10-08), proposed in DESIGN.md §6.2
- **Alternatives:** prompt-only grounding; Anthropic citations API feature.
- **Why:** a check we control makes hallucination a number, not a vibe.
- **Open sub-question:** compare against the API's built-in citations on day 2 (`/decide` then).

## D5. Outside knowledge: passage-only for the MVP (Q2)
- **Status:** Accepted (2026-10-08, Ronith: "the core functionality in the MVP doesn't need that")
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
- **Status:** Accepted (2026-10-08, Ronith); amended by D23 (PDFs go in IndexedDB)
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
- **Status:** Accepted (2026-10-08, Ronith)
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
- **Status:** Accepted (2026-10-09, Ronith: "this project is not ready… the ui is unappealing"); layout amended by D22 (the chat drawer becomes a view)
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
- **Status:** Accepted (2026-10-09, Ronith)
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
- **Status:** Accepted (2026-10-11, Ronith: "let's remove define / quiz for right now. I don't like their behaviors")
- **Context:** after R1, Define and Quiz switched the right pane to chat and Define pasted a quote into the notes; Ronith dislikes both behaviours.
- **Alternatives:** keep them and only change where replies land (unread dot, or a margin card).
- **Rules:** the toolbar buttons and the page/chat wiring go. `core/commands.ts` (with its tests), `prompts/define.md` and `prompts/quiz.md` stay untouched, so they can return with a better shape. Chat still asks free-form questions; React is unchanged.
- **Why:** fewer controls while the v2 layout settles; nothing about the commands' core logic was wrong.
- **Cost we accept:** no quick definitions or self-quizzing until they come back.
- **Revisit if:** Ronith wants them back (Parking lot has the item).

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
