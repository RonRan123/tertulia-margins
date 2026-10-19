# Notes: Hamel Husain & Shreya Shankar's evals FAQ (Claude, 2026-10-17)

Source: [LLM Evals: Everything You Need to Know](https://hamel.dev/blog/posts/evals-faq/), plus the links in it that bear on us. This memo covers what the FAQ teaches, and what it changes in our eval plan ([harness-scorecard-2026-10-17.md](harness-scorecard-2026-10-17.md), [daemon-examples.md](../../evals/daemon-examples.md)).

## What I read

**Read in full:**
- the FAQ itself;
- [LLM-as-a-judge](https://hamel.dev/blog/posts/llm-judge/) ("critique shadowing");
- [Eval smells](https://hamel.dev/blog/posts/eval-smell/);
- [Look at your prompts](https://hamel.dev/blog/posts/prompt/);
- [Field guide](https://hamel.dev/blog/posts/field-guide/) (read earlier);
- the [evals-skills](https://github.com/ai-evals-course/evals-skills) repo README;
- [Theoretical saturation](https://delvetool.com/blog/theoreticalsaturation);
- [Misleading AI advice](https://ai-execs.com/2_intro.html#a-case-study-in-misleading-ai-advice);
- [There are only 6 RAG evals](https://jxnl.co/writing/2025/05/19/there-are-only-6-rag-evals/);
- ["Why I no longer recommend RAG"](https://pashpashpash.substack.com/p/why-i-no-longer-recommend-rag-for);
- [Clio](https://www.anthropic.com/research/clio).

**Read from the abstract only:**
- [Who Validates the Validators?](https://arxiv.org/abs/2404.12272);
- [Play Favorites](https://arxiv.org/abs/2508.06709), on judges favouring their own outputs;
- [GEPA](https://arxiv.org/abs/2507.19457), a prompt optimiser.

**Not read:**
- about a dozen YouTube talks and walkthroughs (no transcripts available);
- course, vendor, benchmark and social-profile links;
- Bischof's Figma deck;
- the Jev, AnkiHub and Paul Graham links (off-topic for us);
- the tracing-naming post, which redirected.

## The practices that matter for us

1. **Error analysis before anything else.**
   - Collect ~100 varied traces. The expert reads at least 30 personally and writes a free-form note on each failure ("open coding").
   - Then group the notes into a short taxonomy of failure types ("axial coding") and count them.
   - Repeat until new traces stop showing new failure types (theoretical saturation).
   - The authors spend 60–80% of development time here.
2. **Don't write the rubric first.** Rubrics written up front miss the failures that actually happen, and criteria shift as you read outputs ("criteria drift", Shankar et al.). Write checks for errors you've *seen*, except for hard rules (for us: never write into the notes, never spoil).
3. **One expert decides:** the "benevolent dictator". For tertulia that's Ronith. A solo builder can be the expert if they really are one, and a reader of their own books is.
4. **Binary pass/fail, plus a critique** detailed enough for a new hire to follow. No 1–5 scales on outputs: they produce mushy middle scores. Track gradual progress with binary sub-checks.
5. **Code checks where possible; an LLM judge only for failures that survive prompt fixes.**
   - A judge needs ~100–200 labels per failure mode, split ~10–20% train (for the judge's prompt examples), 40–45% dev and 40–45% test, with 30–50 passes and 30–50 fails in each of dev and test.
   - Measure the **true positive rate and true negative rate** (does it catch failures; does it pass good outputs), not raw agreement.
   - Judges can favour their own model family (Spiliopoulou et al.), so validate against labels rather than assume.
   - Give a judge only the context its failure mode needs.
6. **Guardrails vs evaluators.**
   - Inline checks that block output must be fast, deterministic and conservative: a false positive is a product bug.
   - Slower, subtler checks run afterwards, as evaluators.
7. **Build your own review tool.**
   - One screen with all the context, rendered the way the domain looks (for us: the note, the card, the cited page).
   - Hotkeys, progress, filters.
   - The evals-skills repo builds this as a single HTML file plus a tiny server.
8. **Synthetic data, if needed, by dimensions.**
   - Hand-write ~20 combinations of dimensions, generate more, then turn them into realistic *inputs* in a separate step.
   - Never generate the expected outputs.
   - Real, permitted data comes first.
9. **Balanced sets.** Test what should happen and what shouldn't. Abstention evals need answerable and unanswerable cases in roughly equal numbers.
10. **Don't chase 100%.** A suite that always passes teaches nothing, and ~70% can be healthy. Retire checks that always pass.
11. **Multi-step pipelines: find the first upstream failure.** Analyse errors stage by stage, since early failures cascade. A "transition failure matrix" (which stage failed, after which) shows hotspots.
12. **Make outputs checkable** (eval smells): small units, provenance on every claim, gaps flagged. "Artifacts that are hard for you to verify are often hard for users too."
13. **Prompts in git; read the actual prompt sent; no prompt optimisers early.** Optimisers like GEPA can't find failure modes you haven't named. Writing the prompt by hand is how you clarify requirements.
14. **"RAG is dead" is overstated.** Retrieval should fit the task. Agentic search (the model looks things up as it goes) suits multi-hop questions; measure it. If we add tools, the RAG framework's *context relevance* question (did it find the passage needed?) is the one to measure first.

## What this changes in our plan

**1. Our 24 examples are seeds, not the rubric.**
- Their bad categories (restates, nit-pick, spoiler…) are my guesses: exactly the top-down rubric the FAQ warns against.
- Keep them as prompt-example candidates and first eval cases.
- The failure taxonomy should come from Ronith's open coding of real traces.

**2. Order of work, revised.** Traces and a review page come first, then reading, then checks:
1. **Traces** (as planned). For each run, log:
   - the inputs;
   - every panel draft, including passes;
   - what the grounding filter dropped, and why;
   - the anchor fallback;
   - the reviewer's pick;
   - tokens and timing.
2. **A trace pool of ~100 runs:**
   - ~30–40 excerpts from Ronith's real notes;
   - the 24 seeds;
   - the rest synthetic inputs built from dimensions:
     - kind of note: claim / question / reaction / quote / definition / research / summary;
     - boldness;
     - link to earlier notes: none / echo / contradiction;
     - position in the book;
     - length.
3. **A review page** (dev-only, one HTML file). It shows the excerpt, earlier notes, each daemon's draft or pass, the card shown and the cited page. Ronith marks pass/fail with a one-line critique, using hotkeys.
4. **Open, then axial coding:** Ronith reads ≥30, then groups the notes and counts each failure type.
5. **Fix the obvious failures in the prompts first.** Only failures that survive get a code check (cheap) or a judge (expensive). Expect one judge at most, for "extends the reader's thinking". The 100–200 labels it needs make it a later step.

**3. The code checks I proposed are guardrails, so they must be conservative.**
- Length and overlap: **flag** in traces; don't drop live.
- Drop live only what's near-certain: a quote that fails `checkCitations`, or an anchor not in the excerpt.

**4. Score at the pipeline stage where the failure starts.** For each failed run, ask: was it the panel's draft, the grounding filter, or the reviewer's pick? Only the trace can tell, which is another reason traces come first.

**5. Ronith's verdict lines.** In `daemon-examples.md` these become **Pass / Fail + critique**.

**6. The just-in-time A/B gets a retrieval measure.** Each example's **Needs** field is ground truth for the question "did the tool find the passage or earlier note the remark needed?" Measure that before judging remark quality.

**7. Where the examples go.**
- The FAQ suggests testing task data and examples in the user turn versus the system prompt.
- Today the daemon examples sit in the system role prompt (`prompts/daemon-role.md`).
- That's a cheap A/B once the eval runs. Moving them is a prompt change, so it's Ronith's call.

**8. The harness rubric needs small corrections** (in [harness-rubric.md](harness-rubric.md)):
- **A3** should say true positive and true negative rates on train/dev/test splits, not precision and recall.
- **A1** level 5 should include "~100 traces, ≥30 read by the expert, until saturation".

**Hours, revised:**

| Step | Hours |
|---|---|
| Traces | ~2 |
| Trace pool, incl. a synthetic generator for inputs | ~2 |
| Review page | ~2 |
| Ronith's reading and coding | ~2–3 (his time) |
| Checks for what survives | ~1.5 |

This is about the same total as before, but the review page replaces a spreadsheet, and the checks come after the reading.
