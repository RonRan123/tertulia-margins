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
- **Status:** Accepted (2026-10-08, Ronith)
- **Context:** Day 0: Claude's app was verbose, led the conversation, and buried the user's notes. Ronith's rule: the user stays in the driver seat, and the notes must not drift toward being AI-run.
- **Alternatives:** amend §5 but allow user-initiated pinning of chat text into notes (~1 h); keep Augment blocks beneath notes with accept/edit/discard.
- **Why:** the notes pane stays trustworthy by construction. A passage snippet pasted by code, not the model, can be checked by `checkCitations`; AI suggestions stay in chat and the user retypes them in their own words.
- **Cost we accept:** no one-click AI notes; Augment is a chat suggestion, not a block.
- **Details:** `/define` shows the definition in chat; the app pastes the verbatim sentence with `[¶n]` into the notes; the user writes the definition themselves. Export has no AI text.
- **Revisit if:** typing everything yourself proves too slow in real use.

## D7. Storage: browser localStorage + markdown export (Q1)
- **Status:** Accepted (2026-10-08, Ronith)
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
- **Status:** Accepted (2026-10-09, Ronith: "there is no actual book to display… it should live in the background as a reference text")
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
