# Harness rubric: best practices for tertulia's daemons (Claude, 2026-10-17)

A rubric for scoring our AI harness against published best practice, then choosing next steps. It's built from every source in [reading-list.md](reading-list.md), plus Ronith's notes and the tools article he added. "Harness" means everything around the model: what it's shown, how it's prompted, when it runs, how its output is checked, and how we learn whether it's working (Böckeler).

## How to use it

**Scoring each technique**
- **One score per technique, 1–5.**
  - 1 = missing. 3 = in place, but partial or untested. 5 = best in class for a product like ours.
- **Score the code, not the docs.** Where DESIGN.md and the code disagree, the code wins and the gap is a finding.
- **A score needs evidence:** a file, a test, a log or a screenshot. "Look at" names where to start.
- **No half points.** If you're between two levels, take the lower one.
- **Some levels name two things.** Score the higher level only if both are true.

**Priority (when to fix)**
- **P1:** blocks knowing whether daemons work, or makes them wrong. Fix first.
- **P2:** makes daemons better or cheaper once P1 holds.
- **P3:** matters later: when daemons get tools, books outgrow the window, or the harness grows.

**After scoring, pick next steps**
- Choose the lowest-scoring **P1** techniques first.
- Then the P2 techniques where one step up is cheap.
- Record everything in the score sheet at the end.

## The ideas behind the rubric (one line each)

1. **Guides and sensors** (Böckeler). A harness needs both. Guides steer before the model acts; sensors check after. With guides only, the rules go unchecked. With sensors only, the same mistakes repeat.
2. **Prefer computational over inferential checks** (Böckeler). Deterministic code first, LLM judgment only where meaning is involved. This matches our principle of preferring deterministic code to a model call.
3. **Read the data** (Husain; Anthropic evals). Every source on evals ends in the same advice: read transcripts, label failures, count them.
4. **Use the smallest set of high-signal tokens** (Anthropic context engineering; Breunig). More context isn't free. Models lose recall as context grows ("context rot"), and stray or clashing content confuses them.
5. **Own your control flow and your context** (12-Factor Agents; Building effective agents). Use plain API calls and our own data tables, with no framework hiding the prompt.
6. **Put help in place, under the reader's control** (Joshi & Vogel; Semantic Reader; Appleton).
   - Margin notes beat a separate chat. Readers preferred choosing the text themselves.
   - The more of the work the reader does, the more they feel the note is theirs (psychological ownership).
   - AI errors need a visible source and a way to check them.

---

## A. Evaluation and feedback (sensors on quality) — P1

Daemon work has felt hard mostly because nothing measures whether a remark was good. Every eval source treats this as the foundation.

### A1. An eval set of real tasks — P1

What exists for testing daemons beyond unit tests.

| Score | Looks like |
|---|---|
| 1 | No daemon test cases; changes are judged by trying the app. |
| 2 | A few saved notes run by hand, compared by eye (logs in `.scratch/`). |
| 3 | A fixed set of 20–50 cases from real notes, runnable by one script, with outputs saved for comparison. |
| 4 | Plus balanced cases: notes where a daemon *should* pass (quotes, definitions, research notes) as well as notes where it should speak. Includes notes past the reader's page and notes the book never discusses. |
| 5 | Plus separate capability and regression suites. Capability cases start at a low pass rate (a hill to climb); regression cases sit near 100%; cases graduate from one to the other. New cases come from every real failure. Each task is unambiguous: two people would grade it the same way. |

- *Sources:* Demystifying evals (start with 20–50 tasks from real failures; balanced problem sets; graduate cases); Husain.
- *Look at:* `core/daemons.test.ts`, `.scratch/s82*.log`, PLAN S8.2 Verify lines.

### A2. Deterministic graders (code checks) — P1

Code that checks every daemon output automatically.

| Score | Looks like |
|---|---|
| 1 | No checks on output. |
| 2 | One check (e.g. quotes exist in the book). |
| 3 | Several checks run on every live output: quote on the cited page, output shape, length cap. Failures are dropped or flagged. |
| 4 | Plus checks for every rule in the prompts that code can verify: the anchor is the reader's own words (not a quote or definition), no page past the reader's position, no phrase attributed to the reader that isn't in the notes, word count. |
| 5 | Plus the same checks run offline over the eval set. Every recurring failure found by reading becomes a new check (the steering loop). Check output is written so a model could use it to fix the problem. |

- *Sources:* Böckeler (computational sensors; the steering loop); Husain level 1 (assertions on every change); Demystifying evals (code-based graders).
- *Look at:* `core/citations.ts`, `groundedNuggets` in `core/converse.ts`, `checkQuestions` in `core/quiz.ts` (the model to copy).

### A3. Model graders calibrated to human judgment — P2

LLM-as-judge for what code can't check, such as "does this extend the reader's thinking?"

| Score | Looks like |
|---|---|
| 1 | None. |
| 2 | An LLM judges or picks outputs, but nobody has checked it against human verdicts (our reviewer today, if uncalibrated). |
| 3 | A judge with a written rubric and **binary** verdicts plus a one-line critique, run on the eval set. |
| 4 | Plus calibration: Ronith labels 25–50 outputs; the judge's agreement is measured (precision and recall, not raw agreement); the judge's prompt is revised until it agrees. |
| 5 | Plus one judge per dimension, an "unknown" option, periodic re-checks for drift, and rubric updates as criteria shift ("criteria drift" is expected). |

- *Sources:* Husain (binary plus critique; batches of 25–50; precision and recall); Shankar et al. (criteria drift); Demystifying evals (calibrate model graders; "unknown"; one judge per dimension).
- *Look at:* `prompts/daemon-reviewer.md`, `reviewNuggets` in `core/converse.ts`.

### A4. Traces, logging and error analysis — P1

Can we see what each call received and returned, and do we study the failures?

| Score | Looks like |
|---|---|
| 1 | No record of calls; failures are noticed by chance. |
| 2 | Ad hoc logs from manual tests. |
| 3 | Every AI call logged locally with its inputs (or a reference to them), output, tokens, cache use, latency and check results. |
| 4 | Plus a simple viewer (a spreadsheet works): one row per run, open notes on what went wrong, failures grouped into a short list of types and counted. |
| 5 | Plus fixes prioritised by frequency; reading continues until no new failure types appear; the viewer has one-click good/bad marking; experiments are logged with what was learned. |

- *Sources:* Husain (log traces; a custom viewer; read until you stop learning); Husain's field guide (open notes, then a taxonomy, then counts); Demystifying evals ("Read the transcripts!").
- *Look at:* `ConverseStats` in `core/converse.ts`, the route handler, `.scratch/`.

### A5. Signals from real readers — P2

Do we learn from what testers do, not just from tests?

| Score | Looks like |
|---|---|
| 1 | Nothing recorded about how readers respond to AI output. |
| 2 | Tester interviews only. |
| 3 | Per-card outcomes recorded locally: shown, clicked, dismissed. |
| 4 | Plus outcome measures tied to the thesis: did the reader write new lines in the paragraph a card answered; did they come back to Reflect; how did quiz recall go. |
| 5 | Plus these signals feed back: daemons see what landed (margin history), and the eval set takes cases from cards readers ignored or dismissed. |

- *Sources:* Demystifying evals (production monitoring, user feedback, layered "Swiss cheese" defences); Husain level 3.
- *Look at:* `DaemonState` in `core/daemons.ts` (cards, pool, `dismissCard`).

---

## B. Grounding and output contracts (sensors on correctness) — P1

### B1. Grounding and provenance — P1

Can every AI claim about the book, or about the world, be traced and checked?

| Score | Looks like |
|---|---|
| 1 | Claims aren't cited. |
| 2 | Cites are asked for in the prompt but not checked. |
| 3 | Quotes checked against the cited page; failures flagged or dropped; cites clickable to the source. |
| 4 | Plus every quote checked wherever AI text appears (chat, margin, quiz). Outside-the-book claims are labelled as such. "Not in the text" is used when the book is silent. |
| 5 | Plus outside claims arrive with real sources the code has verified (e.g. URLs from search results). The prompt asks for quotes first on long documents. Grounding failures are counted in the eval set. |

- *Sources:* Long-context tips (ask for quotes first); Semantic Reader (even slight errors seriously harm readers, so show provenance and give a path to verify); Contextual Retrieval.
- *Look at:* `core/citations.ts`, D38, D39 (the Scholar's unverified claims), `CitedText`.

### B2. Output contracts and failure handling — P2

| Score | Looks like |
|---|---|
| 1 | Free text, parsed loosely. |
| 2 | JSON asked for in the prompt. |
| 3 | Structured outputs enforce a schema; invalid or cut-off replies are treated as failures. |
| 4 | Plus code validates semantic rules after parsing (counts, uniqueness, lengths) and retries once with the reason for the failure. |
| 5 | Plus refusals, truncation (`max_tokens`) and API errors each have a defined, user-visible outcome, and are logged and counted. |

- *Sources:* 12-Factor Agents (tools are structured outputs; compact errors into context); Claude prompting best practices (chain prompts so intermediate outputs can be inspected).
- *Look at:* `PANEL_SCHEMA`, `runQuiz` (one replacement call), the error codes in `core/converse.ts`.

---

## C. Context engineering (guides: what the model sees) — P1/P2

### C1. Context selection: the smallest high-signal set — P1

| Score | Looks like |
|---|---|
| 1 | Everything available is sent every call. |
| 2 | A size cap stops runaway cost, but what's sent isn't chosen for the task. |
| 3 | Each call type gets a deliberate recipe (what it sees and doesn't); irrelevant blocks are left out (e.g. the reviewer sees no book). |
| 4 | Plus the window follows the reader: no pages past their position, so no spoilers by construction; old material is compressed rather than cut. |
| 5 | Plus recipes are tested in the eval set against alternatives (e.g. whole book vs window). The four failure modes (poisoning, distraction, confusion, clash) are watched for, and early "pass" or weak outputs never pile up in context. |

- *Sources:* Context engineering (context rot; smallest high-signal set; just-in-time retrieval); Breunig (failure modes; pruning; quarantine); Contextual Retrieval (under ~200K tokens, include it all with caching).
- *Look at:* `systemBlocks`, `buildContext`, `LIMITS.referenceTokens`, D32.

### C2. Prompt layout — P2

| Score | Looks like |
|---|---|
| 1 | Instructions, data and question mixed in one block. |
| 2 | Some sections, no consistent order. |
| 3 | Long documents first, query last; XML tags separate book, notes, instructions and input. |
| 4 | Plus document metadata in tags (title, page, chapter); consistent tag names across every prompt; stable content before volatile content. |
| 5 | Plus quote extraction before answering where grounding matters; layout choices tested in the eval set. |

- *Sources:* Long-context tips (data at top; query at end, up to 30% better; `<document>` with `<source>`; quotes first); Claude prompting best practices (XML tags).
- *Look at:* `systemBlocks`, `panelTurn`, `quizTurn`, `prompts/daemon-role.md`.

### C3. Memory across sessions — P2

| Score | Looks like |
|---|---|
| 1 | Each call starts from nothing but the current inputs. |
| 2 | Raw history re-sent (the whole notes file). |
| 3 | A structured state per book saved outside the context and read back in (e.g. what's been seen, the cards shown). |
| 4 | Plus memory the model can use: what was said before and how the reader responded, the reader's open questions, session summaries. JSON for status, prose for notes. |
| 5 | Plus a start-of-session routine that loads the right memory. Memory compresses well as notes grow (e.g. the reader's own takeaways). Memory never puts words in the reader's mouth. |

- *Sources:* Context engineering (structured note-taking); Effective harnesses (progress file; start-of-session routine; JSON status); Claude prompting best practices (state management); 12-Factor Agents (unify execution and business state).
- *Look at:* `DaemonState`, `core/store.ts`, `planDaemons`.

### C4. Caching and cost — P2

| Score | Looks like |
|---|---|
| 1 | No caching; cost per call not known. |
| 2 | Costs estimated in docs, not measured. |
| 3 | The book prefix cached; cache reads confirmed in `usage`. |
| 4 | Plus prefixes shared across call types where layout allows; cost and latency logged per call; daily caps based on measured cost. |
| 5 | Plus calls clustered so the cache stays warm (or the TTL chosen by measurement); no silent invalidators; cost per completed reader task tracked. |

- *Sources:* Contextual Retrieval (caching: >2× faster, up to 90% cheaper); the claude-api skill's caching guide.
- *Look at:* `core/converse.ts` (no `cache_control` today), D37 "Caching", DESIGN §6.3.

---

## D. Guides: prompts and personas — P2

### D1. Prompt altitude and explained intent — P2

| Score | Looks like |
|---|---|
| 1 | One-line or vague prompts ("be insightful"). |
| 2 | Long lists of rules and edge cases, little reasoning. |
| 3 | Clear sections, specific instructions, and the *why* behind the key rules. |
| 4 | Plus a minimal prompt to begin with; each rule added in response to an observed failure, with its source noted. |
| 5 | Plus contradictions checked as prompts grow; every rule traceable to an eval case; a newcomer could follow the prompt ("the colleague test"). |

- *Sources:* Context engineering (the right altitude); Claude prompting best practices (be clear and direct; explain why; the golden rule); Böckeler (keep guides coherent).
- *Look at:* `prompts/daemon-role.md`, `action-*.md`, `daemon-*.md`.

### D2. Canonical examples — P2

| Score | Looks like |
|---|---|
| 1 | No examples. |
| 2 | One example, or many near-identical ones. |
| 3 | 3–5 diverse examples in `<example>` tags, including when to pass. |
| 4 | Plus examples drawn from real reader notes and covering each daemon's job; examples aren't reused as output. |
| 5 | Plus examples revised from eval failures and checked for diversity. Eval cases never repeat the examples, so we aren't testing on what we taught. |

- *Sources:* Context engineering ("pictures worth a thousand words"); Claude prompting best practices (3–5 relevant, diverse, structured examples).
- *Look at:* `<examples>` in `prompts/daemon-role.md`.

### D3. Small, focused roles — P2

| Score | Looks like |
|---|---|
| 1 | One prompt does everything. |
| 2 | Personas exist, but job, voice and rules are mixed together. |
| 3 | Each daemon has one job; the job (action) is separate from the voice (persona); rules the app owns live in the action. |
| 4 | Plus jobs that don't overlap (two daemons never make the same point), checked in the eval set. |
| 5 | Plus a separate call per daemon wherever one combined call blurs the voices, decided by measurement. Roles are added only to fill a gap the eval set shows. |

- *Sources:* 12-Factor Agents (small, focused agents); Breunig (context quarantine); Appleton (distinct personas for distinct thinking moves); Building effective agents (parallelization).
- *Look at:* `ACTIONS` and `DAEMONS` in `core/daemons.ts`, D37 "Revisit if: voices blur".

---

## E. Orchestration and timing — P1/P2

### E1. Workflow over agent; we own the control flow — P2

| Score | Looks like |
|---|---|
| 1 | A framework hides prompts or decides steps. |
| 2 | Hand-written calls, but the step logic is scattered through UI code. |
| 3 | Code decides every step; prompts are plain files; no framework. |
| 4 | Plus every stage is a row in a data table (trigger, context recipe, prompt, schema, checks, where the output lands), and pure functions take a state and an event and return the new state. |
| 5 | Plus model-directed steps (an agent loop) only where a workflow measurably fails, with a cap on iterations. |

- *Sources:* Building effective agents (workflows vs agents; skip frameworks); 12-Factor Agents (own your prompts; own your control flow; a stateless reducer).
- *Look at:* `core/daemons.ts` (`planDaemons`, `afterRun`), `useDaemons` in `app/components/Margin.tsx`, PLAN S8.4.

### E2. Evaluator step in the loop — P2

| Score | Looks like |
|---|---|
| 1 | Output goes straight to the reader. |
| 2 | Code filters only. |
| 3 | A separate reviewer call picks or rejects candidates against stated criteria. |
| 4 | Plus failing items go back for one revision with the reason, and the reviewer's choices are logged. |
| 5 | Plus the reviewer is calibrated to human labels (A3), and its rejections feed the error analysis. |

- *Sources:* Building effective agents (evaluator-optimizer); Claude prompting best practices (draft, then review, then refine).
- *Look at:* `reviewNuggets`, `prompts/daemon-reviewer.md`, the quiz's replacement call.

### E3. Trigger timing and interruption — P1

| Score | Looks like |
|---|---|
| 1 | AI output appears at arbitrary moments with no way to control it. |
| 2 | Automatic triggers on a timer or pause, with no off switch. |
| 3 | Triggers tied to the reader's work (enough new words), with a manual trigger as well. |
| 4 | Plus triggers at natural breaks (end of a session or section) by default; automatic mid-writing runs are opt-in. |
| 5 | Plus the trigger is tested with readers (does it interrupt?), and the reader's own signal of being done is the main trigger. |

- *Sources:* Joshi & Vogel (reader control; manual selection preferred); Appleton (suggestions fade if ignored); reading-loop memo §2.3.
- *Look at:* `LIMITS.daemons`, `useDaemons`, D37's cadence.

---

## F. Reader experience (where the harness meets the reader) — P2

### F1. In-place integration and anchoring — P2

| Score | Looks like |
|---|---|
| 1 | AI only in a separate chat. |
| 2 | Margin output, loosely placed. |
| 3 | Each remark anchored to the words it answers and placed beside them. |
| 4 | Plus a click shows the anchor, and cites open the source at the passage; past remarks are easy to find again. |
| 5 | Plus the reader can point at text and ask a margin action on it (manual selection), and the anchor survives edits. |

- *Sources:* Joshi & Vogel (integrated margin notes preferred; let readers point at text instead of describing it; manual selection); Semantic Reader (help placed in the text).
- *Look at:* `findExcerpt`, `stackCards`, the card highlight in `Margin.tsx`.

### F2. Reader control and ownership — P2

| Score | Looks like |
|---|---|
| 1 | AI text can enter the reader's work, or isn't visibly AI. |
| 2 | Visibly distinct, but the reader can't steer or dismiss. |
| 3 | AI text is always distinct and never in the notes; the reader can dismiss and switch features off. |
| 4 | Plus the reader can choose what to ask about and which daemon. A prompt they typed and the AI's answer look different (e.g. grey italic prompt; AI answer with a sparkle icon). |
| 5 | Plus the reader's own effort is built in: the AI prompts, the reader writes (answer in notes, takeaways). Several techniques offered, so readers choose how much AI help they want. |

- *Sources:* Joshi & Vogel (more human involvement means more ownership; offer several techniques; the prompt/response styling Ronith noted); Appleton; D6.
- *Look at:* the D47 settings, card styles, D6 and D46.

### F3. Learning effectiveness — P2

Does the loop make the reader do the thinking, and does it help them remember?

| Score | Looks like |
|---|---|
| 1 | The AI does the thinking (summaries, answers). |
| 2 | Prompts for thought, without follow-through. |
| 3 | The reader retrieves and generates: questions they answer, quizzes, writing in their own words. |
| 4 | Plus spacing (review returns over days) and monitoring of understanding (the reader sees what they missed). |
| 5 | Plus learning is measured (recall over time) and the loop adapts to what this reader hasn't absorbed. |

- *Sources:* Matuschak (readers must "plan and steer their own feedback loops"; spaced, embedded review); Joshi & Vogel (readers valued practice questions as active engagement).
- *Look at:* `core/quiz.ts`, D42–D44, the reading-loop memo §2.5.

---

## G. Later: tools and harness upkeep — P3

### G1. Tool design (when daemons get tools) — P3

| Score | Looks like |
|---|---|
| 1 | No tools; or many overlapping ones. |
| 2 | Tools mirror internal functions one-to-one. |
| 3 | A few tools for high-impact jobs (e.g. `find_passage`, `get_pages`). Clear names, strict schemas, descriptions written as for a new teammate. |
| 4 | Plus outputs that save tokens (paging, filtering, readable fields instead of IDs) and errors that say how to fix the call. |
| 5 | Plus tools evaluated on realistic multi-call tasks, then refined from transcripts. |

- *Sources:* Writing tools for agents (Ronith's note: a tools file the model reads); Breunig (tool loadout); Context engineering.
- *Look at:* not applicable yet. This becomes relevant with Connect (search) or just-in-time page lookup.

### G2. The steering loop and harness upkeep — P3

| Score | Looks like |
|---|---|
| 1 | Fixes are one-off patches. |
| 2 | Decisions logged, but recurring issues aren't turned into rules or checks. |
| 3 | Each recurring failure becomes a guide (a prompt rule or example) or a sensor (a check), and is noted where it came from. |
| 4 | Plus docs as the system of record (DESIGN, DECISIONS, PLAN kept in sync), with every limit in one place. |
| 5 | Plus periodic clean-up: dead rules removed, guides and sensors checked for contradictions, coverage of guides and sensors reviewed. |

- *Sources:* Böckeler (the steering loop; keep quality left; open questions about coherence and coverage); OpenAI harness engineering (docs as system of record; mechanical enforcement; clean-up); Effective harnesses.
- *Look at:* `docs/DECISIONS.md`, `core/limits.ts`, CLAUDE.md.

---

## Score sheet

Blank, for re-scoring. Filled-in scores: [harness-scorecard-2026-10-17.md](harness-scorecard-2026-10-17.md).

| # | Technique | Priority | Score (1–5) | Evidence | Next step |
|---|---|---|---|---|---|
| A1 | Eval set of real tasks | P1 | | | |
| A2 | Deterministic graders | P1 | | | |
| A3 | Calibrated model graders | P2 | | | |
| A4 | Traces and error analysis | P1 | | | |
| A5 | Signals from real readers | P2 | | | |
| B1 | Grounding and provenance | P1 | | | |
| B2 | Output contracts | P2 | | | |
| C1 | Context selection | P1 | | | |
| C2 | Prompt layout | P2 | | | |
| C3 | Memory across sessions | P2 | | | |
| C4 | Caching and cost | P2 | | | |
| D1 | Prompt altitude | P2 | | | |
| D2 | Canonical examples | P2 | | | |
| D3 | Small, focused roles | P2 | | | |
| E1 | Workflow, owned control flow | P2 | | | |
| E2 | Evaluator in the loop | P2 | | | |
| E3 | Trigger timing | P1 | | | |
| F1 | In-place integration | P2 | | | |
| F2 | Reader control and ownership | P2 | | | |
| F3 | Learning effectiveness | P2 | | | |
| G1 | Tool design | P3 | | | |
| G2 | Steering loop and upkeep | P3 | | | |

## Notes on the sources

- **Joshi & Vogel** (CHI '26) found that the degree of AI involvement had **no measurable effect on comprehension** in their three experiments. Readers did value AI practice questions as active engagement. The claim in Ronith's note that AI-generated questions led to higher comprehension scores seems to come from prior work the paper cites (e.g. Liu et al. 2023), not from its own results. Worth re-checking before the blog.
- **Not fully read:**
  - The Lenny's Newsletter page gave only an outline; Husain's field guide filled the gap.
  - Appleton's Shop Talk episode is audio; her sketchbook page was used.
  - OpenAI's harness post returned 403; InfoQ's summary was used.
  - The CACM page returned 403; the arXiv HTML version of the Semantic Reader paper was used.
  - Shankar et al.: abstract only.
  - 12-Factor Agents: factor titles only.
