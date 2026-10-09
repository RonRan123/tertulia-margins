# tertulia-margins: Design Document

*A tertulia of one.* A note-first AI reading partner: you write the margin notes, it talks back.

| | |
|---|---|
| Owner | Ronith (decides); Claude (executes) |
| Status | Draft v0.1, 2026-10-08 |
| Budget | 7 days x 3 h = 21 h |
| Companion docs | [PLAN.md](PLAN.md) (progress), [DECISIONS.md](DECISIONS.md) (why) |

This document explains *what* we are building and *why this shape*, framed as trade-offs against the constraints. It is a living doc: when implementation teaches us something, this file changes in the same commit.

---

## 1. Problem

Good books hide their best ideas in dense passages. A reader working through a physical book transcribes quotes and reflections into Obsidian, but the notes stay inert: nothing pushes back, defines the unfamiliar term, or points out that a reflection misreads the passage.

Existing tools start from the wrong end. NotebookLM and Readwise Ghostreader are **source-first**: you upload text and the AI summarizes or answers. The reader's own thinking is an afterthought.

We want the inverse: **note-first**. The reader's notes are the primary artifact and steer every AI response. The AI's job is to make the reader's thinking sharper, never to do the thinking for them.

## 2. Goals

1. **Grounded conversation about a passage.** Every claim about the book cites the supplied text. Unsupported claims say "not in the text."
2. **Notes steer the AI.** The user's notes are always in context and shape replies. AI text lives only in the chat pane, so it is never confused with the user's notes (D6).
3. **Commands on a selection.** `/define`, `/quiz`, `/expand` act on a selected line, Jupyter-style.
4. **Augment, don't replace.** The AI can suggest an expansion of a terse note with context from the text, and flags where a note disagrees with the passage. Suggestions appear in chat; the user writes any note text themselves (D6).
5. **Obsidian-compatible.** Notes export to markdown.
6. **Portfolio-grade evidence.** A day-7 write-up with screenshots and *measured* cost-per-session and time-to-first-token (TTFT).

## 3. Non-goals

These are deliberately excluded so they cannot creep back in silently.

- **Rich-text editor.** A plain markdown textarea. Editors are a known rabbit hole.
- **Tensions across a body of work** (multiple books/authors). This is a research problem. v4 does one book only.
- **Accounts, auth, multi-user, sync.** Single user, single browser.
- **OCR / photo input** in the first week.
- **DRM'd ebooks.** We never handle DRM.
- **Recommendations or summaries.** Blinkist-style summaries are the opposite of the point.

## 4. Constraints

- **21 hours total.** Every decision is judged first by hours saved.
- **The user is learning.** Ronith must understand and make the key decisions, so the code must be legible to someone who did not type it.
- **Copyright.** Book text is the user's private input. It is never committed to git and never shipped in the public demo.
- **Cost.** Personal API key; a session should cost cents, not dollars. Measured, not guessed.

## 5. The core loop

The interaction model is the product's whole differentiation, so it is specified first.

1. The user types or pastes reference text from the book, with `[p. N]` page markers, or imports it from a PDF (D13). It stays in the background as reference, not a reading pane (D14).
2. The user writes notes in the left pane as they read, exactly as they would in Obsidian.
3. The user selects a line (in the passage or their notes) and runs a command, or asks a free-form question in the right pane.
4. The AI replies in the right pane, citing paragraphs of the passage. Replies never edit the user's notes.
5. The user may press **Augment** on a note: the AI proposes an expansion in the chat pane. Nothing is added to the notes; the user rewrites it in their own words if they want it.
6. Commands that point at the text (e.g. `/define`) also get a verbatim passage snippet with its `[¶n]`, pasted into the notes by the app (plain code, not the model) and marked as a quote.
7. Export produces one markdown file: passage reference, the user's notes, and the marked passage quotes. No AI-written text.

The invariant: **the notes pane holds only the user's words and verbatim passage quotes. AI-written text never enters it** (D6).

## 6. Design overview

```
Browser (one page)
  ┌───────────────┬───────────────┐
  │  Notes pane   │  Chat pane    │   passage + notes kept in browser storage
  │  (textarea)   │  (stream)     │
  └───────┬───────┴───────▲───────┘
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

### 6.1 Why it is shaped like this

**Next.js is a thin shell.** All product logic lives in `core/` as plain TypeScript with no framework imports. The route handler only parses input and streams output. This keeps framework "magic" out of the parts Ronith needs to understand, and means `core/` can be tested without a server.

**One deep module, not many shallow ones.** `converse()` is the single entry point: it takes `{command, passage, notes, selection, history}` and returns a stream. Context assembly, model routing, and citation checking are internal details. The UI never knows which model ran.

**Prompts are data, not code.** Each command's instructions live in `prompts/<command>.md`. Ronith writes and tunes these directly; they are the most important "code" in the project and the part that should carry his voice and judgment.

**Commands are a table, not a class hierarchy.** A command is `{name, promptFile, model, maxTokens}`. Adding a command is adding a row.

### 6.2 Grounding: how we stop invented quotes

This is the highest technical risk (see §9), so it gets a concrete mechanism rather than a hopeful prompt.

1. **Paragraph IDs.** The passage is split into paragraphs and labelled `[¶1]`, `[¶2]`, ... before it goes into the prompt. The app also records each paragraph's page from the `[p. N]` markers in the reference text, which are stripped before the text reaches the model (D13). PDF import inserts `[PDF p. N]` markers instead, since its pages don't match the paper book. The model cites `[¶n]`; the UI shows the page beside it, so the model never has to guess a page number.
2. **Cite or abstain.** The system prompt requires every claim about the book to cite `[¶n]` and to quote at most a short span. If the text does not support an answer, the model says "not in the text."
3. **Deterministic check.** After streaming, `checkCitations` verifies each quoted span actually appears in the cited paragraph (after whitespace/quote normalization). Failures are flagged in the UI, not hidden.
   Rules (Ronith, Sprint 1): a quote is checked against the citations in its own sentence (none → `citation_missing`); a range like `[¶18-19]` passes if the quote is in any paragraph of it; quotes under 3 words are scare-quotes and are skipped; a cite to a paragraph that doesn't exist is `citation_not_found`; otherwise `quote_not_in_paragraph`. Normalization ignores case, curly vs straight quotes, `_italics_` markers, spacing and trailing punctuation; `…` splits a quote into fragments that must each appear.

Step 3 is the key idea: it turns "is the model hallucinating?" from a vibe into a number we can put in the write-up.

*Objection: "Won't strict grounding make the AI useless for background, like an author's biography?"* Possibly. For the MVP we accept that cost: the AI is strictly passage-only (D5). Labelled outside knowledge is a post-MVP addition (PLAN.md Parking lot).

### 6.3 Context and cost

The prompt is ordered stable-to-volatile: system prompt, then passage, then notes, then the conversation. The passage is the largest and most stable part, so it is the prefix we **prompt-cache**. Caching should cut both cost and TTFT on every turn after the first; we will measure the before/after, since it makes a concrete write-up result.

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
| 5 | v2 | Prompt caching and per-call logging, `/expand`, Augment (chat suggestion), disagreement flags, model routing, public demo |
| 6 | v3 | Book-level memory |
| 7 | v4 | `/tensions` on one book, eval set, cost readout, write-up |

**Cut line:** if the MVP (v1) is not done by end of day 4, everything after it is dropped except the write-up. v1 is a complete, usable tool.

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
- **Q4. Hosting.** *Resolved (D9): public Vercel demo where visitors bring their own API key; public-domain sample text only.*
- **Q5. v3 approach.** Long-context + caching vs chunked retrieval.
- **Q6. Write-up audience.** *Resolved (D10): LLM engineers, with a one-paragraph product story and screenshots up top.*
- **Q7. Day-0 findings.** *Resolved (D6): the AI never writes into the notes; §5 amended.*

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
- **Augment:** the AI suggests an expansion of a note in chat; the user writes any note text themselves.
- **TTFT:** time to first token of a streamed reply.
