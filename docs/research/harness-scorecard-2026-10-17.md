# Harness scorecard, 2026-10-17

Our harness scored against [harness-rubric.md](harness-rubric.md), on branch `sprint-9` at commit 2dbe5ad. The scores follow the rubric's rules: the code is scored, not the docs; a score needs evidence; and when torn between two levels, the lower one wins. Next steps that are product, architecture or data-model choices are marked **/decide**. Nothing here is decided.

## Summary

| # | Technique | Priority | Score | One-line reason |
|---|---|---|---|---|
| A1 | Eval set of real tasks | **P1** | **2** | Manual scripts with logs compared by eye; no fixed case set |
| A2 | Deterministic graders | **P1** | **3** | Quotes, schema and cut-off checked; length, anchor and attribution not |
| A3 | Calibrated model graders | P2 | 2 | The reviewer judges, but has never been checked against human labels |
| A4 | Traces and error analysis | **P1** | **2** | Stats go to the browser and are dropped; nothing is persisted or studied |
| A5 | Signals from real readers | P2 | 1 | Dismiss deletes the card; clicks and replies aren't recorded |
| B1 | Grounding and provenance | **P1** | 4 | Quotes checked everywhere, cites clickable; outside claims unsourced |
| B2 | Output contracts | P2 | 4 | Schemas, cut-off handling, quiz retry; failures not counted |
| C1 | Context selection | **P1** | **3** | A recipe per call type; whole book every call, no reading window |
| C2 | Prompt layout | P2 | 3 | Book first, XML, query last; little metadata, no quote-first |
| C3 | Memory across sessions | P2 | 3 | Daemon state saved per book, but never shown to the model |
| C4 | Caching and cost | P2 | 2 | No `cache_control`; cost estimated in docs, not measured |
| D1 | Prompt altitude | P2 | 3 | Clear sections that explain why; long, not grown from a minimal base |
| D2 | Canonical examples | P2 | 3 | Four diverse examples, including passes; illustrative, not real notes |
| D3 | Small, focused roles | P2 | 3 | Action and persona separated; overlap rule not checked |
| E1 | Workflow, owned control flow | P2 | 3 | Pure planner functions, no framework; stages not a table |
| E2 | Evaluator in the loop | P2 | 3 | A separate reviewer; no revision, choices not logged |
| E3 | Trigger timing | **P1** | **3** | Work-based trigger plus a manual one; still mid-writing, no off switch |
| F1 | In-place integration | P2 | 4 | Anchored, highlight on click, survives edits; no reader-chosen text |
| F2 | Reader control and ownership | P2 | 2 | Distinct and dismissable, but daemons can't be switched off |
| F3 | Learning effectiveness | P2 | 3 | The quiz has the reader recall and write; no spacing |
| G1 | Tool design | P3 | n/a | Daemons have no tools yet |
| G2 | Steering loop and upkeep | P3 | 3 | Failures turned into rules and checks; docs claim caching that isn't built |

**Lowest P1 scores:** A1 (2) and A4 (2), then A2, C1 and E3 (3).

All three groups are uneven:
- **Strongest:** grounding (B1), output contracts (B2) and in-place integration (F1), each at 4.
- **Weakest:** everything that measures whether the daemons work (A1, A3, A4, A5).

That lack of measurement is why each daemon change (D37, D38, D39) was judged by eye.

---

## Evidence, technique by technique

### A. Evaluation and feedback

**A1. Eval set — 2**
- **What exists:** live daemon scripts in `.scratch/` (`s82a.ts`, `s82c.ts`).
  - They run 3–4 hand-written excerpts through `converse()`.
  - They print the events and usage.
  - Their logs are compared by eye (`s82c-old.log` vs `s82c-new.log`).
- **Unit tests:** `core/daemons.test.ts` and `core/converse.test.ts` test the plumbing (cadence, schema, grounding filter) with fake clients. They never test the quality of a remark.
- **Not a 3:** there's no fixed, re-runnable case set and no saved outputs to compare against. `.scratch/` is gitignored, so even these scripts aren't part of the repo.

**A2. Deterministic graders — 3**
- **What's checked** in `runDaemons` and `groundedNuggets` (`core/converse.ts`):
  - every quote (`checkCitations`), and a nugget whose quote fails is dropped;
  - the output shape (`PANEL_SCHEMA`), and an unknown or duplicate daemon is dropped;
  - a cut-off reply (`isCutOff`) counts as no nuggets.
- **Not checked:**
  - **Length.** The prompt asks for ~30 words and `limits.ts` comments say ≤40, but no code checks it. Logs show 33–46 words (PLAN S8.2c).
  - **The anchor.** An anchor not found in the excerpt silently falls back to the excerpt's first line, which may be a quote or a definition (`groundedNuggets`). Nothing checks that it's the reader's own words.
  - **Attribution.** Nothing checks for "you note…" phrases that aren't in the notes.
  - **Position.** Nothing checks for pages past the reader, since no reading position exists.
- **For comparison:** the quiz's `checkQuestions` in `core/quiz.ts` checks every rule code can check. It's the model to copy.

**A3. Calibrated model graders — 2**
- The reviewer (`reviewNuggets`, `prompts/daemon-reviewer.md`) is an LLM judge with written criteria and a forced choice.
- It has never been compared with Ronith's judgement on a labelled set.
- When `mustPick` is set and it returns nothing, the code falls back to the first nugget (`nuggets[0]`).

**A4. Traces and error analysis — 2**
- **What's recorded:** `converse()` returns `ConverseStats` (model, stop reason, usage, `reviewerUsage`, timing, citations). The route sends it to the browser as the `done` event.
- **What happens to it:**
  - `lib/converse-client.ts` uses only `stats.citations` (and `stopReason` for empty replies). The rest is dropped.
  - The server logs only failures (`console.error("converse failed:")` in `app/api/converse/route.ts`).
  - Nuggets the reviewer passed over are kept in `pool`, but only up to 6, and for display, not analysis.
- **Result:** nobody can see what a run received and returned, or count failure types.

**A5. Signals from real readers — 1**
- Dismissing a card removes it (`dismissCard` in `core/daemons.ts`), with no record that it happened.
- Highlight clicks (`onToggle` in `app/components/Margin.tsx`) aren't recorded.
- Nothing notices whether the reader wrote more after a card.
- This becomes a 2 once tester feedback (which began Oct 16) is written down.

### B. Grounding and output contracts

**B1. Grounding and provenance — 4**
- **What works:**
  - `checkCitations` (`core/citations.ts`) checks every quote of 3+ words against its cited page, or against the book and notes. It runs on chat replies (flagged), daemon nuggets (dropped) and quiz questions (replaced).
  - Cites render as clickable pills that open the PDF at the passage (D45, `CitedText`).
  - "Not in the text" is in `system.md`.
  - The Scholar's cards are labelled "beyond the book" (D39).
- **Not a 5:**
  - The Scholar's claims about other works have no verified source.
  - No prompt asks for relevant quotes before the answer.
  - Grounding failures aren't counted.

**B2. Output contracts — 4**
- **What works:**
  - The panel, reviewer, quiz and grader use structured outputs (`output_config.format`).
  - A cut-off panel reply is treated as a failure.
  - `checkQuestions` validates the quiz's semantic rules and `runQuiz` retries once with reasons.
  - Refusals use server-side fallbacks (`fallbacks: "default"`).
  - Errors map to string codes with visible statuses ("Couldn't reach the daemons…").
- **Not a 5:** daemons get no retry with reasons, and failures aren't logged or counted.

### C. Context engineering

**C1. Context selection — 3**
- **What works:** each call has its own recipe. Chat gets `system.md`, the panel gets `daemon-role.md`, the reviewer sees no book (`reviewerTurn`), and the grader sees only the cited pages (D44).
- **Not a 4:**
  - Every book-reading call sends the whole reference text up to 50K tokens (`systemBlocks`, `LIMITS.referenceTokens`). There's no window by reading position, so pages past the reader can be used.
  - The whole notes file goes as `<notes>` on every call.
  - **React to notes** also sends all the notes again as the excerpt: up to ~25K tokens twice, which D37's amendment accepts.

**C2. Prompt layout — 3**
- **What works:**
  - `<book_text>` comes first, split into `<page n="…">`.
  - The role prompt comes next, then `<notes>`.
  - The task goes last in the user turn (`<daemons>`, `<excerpt>`).
  - Tag names are consistent.
- **Not a 4:**
  - There's no title, author or chapter metadata on the book in daemon calls. The title appears only through `system.md`'s template for chat.
  - Nothing asks for quote extraction first.

**C3. Memory across sessions — 3**
- **What's saved:** `DaemonState` (`cards`, `pool`, `seen`, `linesSinceCard`) is saved per book in `core/store.ts`.
- **What the model sees of it:** nothing. Daemons never see their past remarks or what happened to them, so repeats are possible.
- **No session concept:** "what's new" is computed from line fingerprints.

**C4. Caching and cost — 2**
- No `cache_control` anywhere in `core/converse.ts`, although DESIGN §6.3 and D37 describe caching.
- Cost per call is estimated in D32 but not measured: usage comes back, then is dropped (see A4).
- The daily caps (60 replies, 40 daemon runs) were set by judgement.

### D. Prompts and personas

**D1. Prompt altitude — 3**
- **What works:** `daemon-role.md` has clear sections that explain their reasons (`<what_a_remark_is_for>`, `<what_to_answer>`, `<how_to_write_a_remark>`). Several rules trace to observed failures in D39 ("added from Ronith's poioumenon example").
- **Not a 4:** the prompt is long (~1,300 words) and wasn't grown from a minimal base. Most rules can't be traced to an eval case, because none exist (A1).

**D2. Canonical examples — 3**
- **What works:** four `<example>` blocks in `daemon-role.md`. They're diverse (a sweeping claim, an earlier-note connection, a definition plus a claim, a quote plus a definition), and they include passing.
- **Not a 4:** they're illustrative Pride and Prejudice notes, not real reader notes.

**D3. Small, focused roles — 3**
- **What works:** actions (`ACTIONS`) are separate from personas (`DAEMONS`) in `core/daemons.ts`, and each daemon has one job.
- **Not a 4:**
  - All three daemons draft in one panel call. D37 accepted the risk that their voices blur.
  - "Two daemons should never make the same point" is a prompt rule, not a check.

### E. Orchestration and timing

**E1. Workflow, owned control flow — 3**
- **What works:**
  - No framework, and prompts are plain files.
  - `planDaemons`, `afterRun` and `afterPromote` are pure functions over the daemon state, a near-reducer shape.
- **Not a 4:**
  - The trigger and run logic live in a React hook (`useDaemons` in `Margin.tsx`).
  - Stages aren't rows in a table.
  - The panel → reviewer chain is hand-wired in `runDaemons`.

**E2. Evaluator in the loop — 3**
- **What works:** a separate reviewer call picks one nugget or none.
- **Not a 4:**
  - A rejected nugget isn't revised.
  - The reviewer's choices and reasons aren't logged (it returns only `pick`).
  - The reviewer is uncalibrated (A3).

**E3. Trigger timing — 3**
- **What works:**
  - A run needs 10 own lines and a 25 s pause (`LIMITS.daemons`, `useDaemons`).
  - **React to notes** is a manual trigger.
  - Failed runs don't retry in a loop.
- **Not a 4:**
  - Automatic runs are the default while the reader writes, which is exactly mid-task.
  - There's no natural-break trigger.
  - The gear (`app/components/Settings.tsx`) offers Quote autocomplete, Page links and Dark theme, but no switch for the daemons.

### F. Reader experience

**F1. In-place integration — 4**
- **What works:**
  - Cards sit level with the words they answer (`stackCards`).
  - A click tints the anchor in the notes, as a CodeMirror mark that follows edits.
  - Cites open the PDF at the passage.
  - Cards persist per book.
- **Not a 5:** the reader can't select text and ask a daemon about it. Joshi & Vogel found readers preferred choosing the text themselves.

**F2. Reader control and ownership — 2**
- **What works:**
  - AI text never enters the notes (D6).
  - Cards are visibly the daemons'.
  - × dismisses a card.
- **Not a 3:** daemons can't be switched off. The rubric's level 3 needs features the reader can turn off, and the hook runs whenever the margin pane is mounted, which is always, since hidden panes stay mounted (DESIGN §6.1).
- **Also missing:** the reader can't choose which daemon to hear or what to ask about.

**F3. Learning effectiveness — 3**
- **What works:**
  - The Quiz view has the reader recall answers (multiple choice, blanks) and write them (free response, graded).
  - The review shows what they missed (D42–D44).
  - Daemon remarks are framed as questions to carry forward (D39).
- **Not a 4:**
  - Nothing returns over days.
  - The 30 remembered questions (`QuizState.asked`) are for variety, not review.

### G. Later

**G1. Tool design — n/a.** Daemons make single structured calls with no tools. Score this when Connect or page lookup arrives.

**G2. Steering loop and upkeep — 3**
- **What works:**
  - Decisions are logged diligently (D1–D47).
  - Every limit lives in `core/limits.ts`.
  - Recurring failures became rules (D39) or checks (whitespace-blind quote matching, S8.2b).
- **Not a 4:** the "docs as system of record" bar fails in places. DESIGN §6.3 and D37 describe caching that isn't built, and DESIGN §2 and §5 still describe `/define`.

---

## Next steps for the lowest P1 scores

These are in the order I'd do them. Steps 1–2 are one piece of work: the logging feeds the eval, and the eval set gives the logs something to compare against. Together they turn "daemons are hard" into a number that moves.

### 1. A4 → 4: trace every daemon run, and read them (~2 h)

**Data-model and privacy choice — /decide.** Tester traces would contain their notes and book text. D34 and D35 keep books in testers' browsers, so traces can't simply go to a server log on Vercel. Options:
- **(a) Dev and eval runs only, written to `.scratch/traces/`.** No tester data leaves the browser. *Recommended for now.*
- **(b) A trace log kept in the tester's browser, with an "Export my session" button** they choose to send.
- **(c) Server logs on Vercel with the notes stripped.** That loses what makes a trace useful.

**Build** (for option a):
- `converse()` already returns everything a trace needs. Add the panel's raw drafts (including passes), the anchor fallback, the reviewer's pick, and tokens with cache fields.
- The eval script (step 2) writes one JSON line per run.
- A spreadsheet with one row per nugget: excerpt, daemon, nugget, anchor, word count, check results, picked?, and blank columns for Ronith's good/bad mark and a note.

**Done when:** 30 runs are in the sheet, Ronith has marked them, and the failures are grouped and counted (Husain's field guide).

### 2. A1 → 3, toward 4: a daemon eval set (~3 h, plus Ronith's notes)

**Fixtures:**
- 2–3 public-domain books, so book text can be committed or fetched by script without breaking the copyright rule.
- 20–30 excerpts in fixture files, drawn where possible from Ronith's real notes.
- Balanced: some should get a remark, and some should get only passes (copied quotes, definitions, research notes, page references).
- Plus cases the book never discusses, and cases about earlier notes.

**Script:** `scripts/daemon-eval.ts`, run with something like `npm run eval:daemons`. For each fixture it calls `converse()` for real, applies the code checks (step 3), writes the traces and prints a scorecard:
- pass rate where a pass was expected;
- check failures by type;
- average words;
- reviewer picks.

**Cost:** each full run is ~30 paid calls (D35's caps don't apply to scripts).

**/decide:** where fixtures live, and whether Ronith's real notes may be committed. His notes are his own writing; the book text must be public domain.

**Done when:** one command reproduces a scorecard, and a prompt change can be compared before and after.

### 3. A2 → 4: add the missing code checks (~1.5 h)

Each check should go in `groundedNuggets` (to drop or flag live output) and in the eval script (to count):
- **Length:** ≤40 words (the number already in `limits.ts`'s comment). Flag in the eval; Ronith decides whether to drop live.
- **Anchor is the reader's own words:** found in the excerpt, on a line `ownLines` counts. Today a missing anchor silently falls back to the first line.
- **No false attribution:** "you note / you wrote / you see / you argue" followed by words not found in the notes.
- **No overlap:** two nuggets in one run sharing most of their content words. Flag only.

**Done when:** each check has a unit test, and the eval scorecard reports each one.

### Then: E3 and C1 (both 3), already designed

- **E3 → 4:** silence while reading. Automatic runs off by default behind a daemon switch in the gear (this also lifts **F2** to 3), and **Done reading** as the trigger. Reading-loop memo decision 3. **/decide.** ~1.5 h.
- **C1 → 4:** the reading-position window (pages 1 to the session's end page) plus not sending the notes twice. Reading-loop memo decision 8. **/decide.** ~2 h, after sessions exist.

### Cheap P2 wins to take along the way

- **C4 → 3:** add `cache_control` after `<book_text>` and log cache reads (~1 h). Step 1's traces will show whether it works.
- **A3 → 4:** once step 1's marks exist, compare the reviewer's picks with Ronith's labels (~1 h). It reuses data we'll already have.
