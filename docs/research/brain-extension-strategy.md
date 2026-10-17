# Brain-extension strategy (Claude, 2026-10-15)

> **Updated 2026-10-16:** Ronith made daemons the core value and set a five-stage loop. That replaces this memo's "daemons as a supporting act" framing; see [reading-loop-and-daemon-harness.md](reading-loop-and-daemon-harness.md).

Recommendations only; nothing is decided until it goes through `/decide`. Based on the docs, `prompts/` and `core/` as of commit 2dbe5ad.

## 1. Verdict

Split the product into a **reading mode** where the AI is silent and a **reflecting mode** the reader opens when they stop. Today the daemons run on their own 25 s after the reader pauses (`LIMITS.daemons.idleMs`, `useDaemons`) in the default view (`core/store.ts:158`, `"notes+margin"`), and nothing turns them off; that is the one part of the build that cuts against both the thesis and Ronith's own workflow. The quiz, which Ronith found easy and valuable, shows where the value is: retrieval at a natural break, with a fixed shape our code can check. So the product should become *write in silence, then reflect, then recall*, with daemons serving the reflect step and vocabulary joining the recall step as plain code.

## 2. Workflow map

| Workflow step | Today in the app | Gap | AI's role |
|---|---|---|---|
| Write own thoughts while reading | CodeMirror notes with live preview (D25), Obsidian list keys (D36) | Daemons run on their own after 25 s idle (D37, `planDaemons`); no off switch (D47) | **None** |
| Transcribe quotes | Quote autocomplete from the book's text (D46, `core/quote-complete.ts`) | None | **None** (code) |
| Page references | Page links as pills, matched by exact quote / overlap / page (D33, D45) | None | **None** (code) |
| Look up a word, write the definition | Nothing. Define left the UI (D24); `prompts/define.md` still exists | Definition lines aren't recognised as vocabulary | **None**: code finds `word — definition` lines |
| Re-read notes | The notes; margin cards with click-to-highlight (S8.2b′) | No notion of a session ("what I wrote today") | **Limited**: daemons on the session's notes |
| Research blogs, Reddit, Goodreads | Non-goal (DESIGN §3, Parking lot); The Scholar brings unverified outside knowledge (D39) | No sources, by design | **None/limited**: keep out; Scholar is the limited version |
| Vocabulary quiz | Quiz topic "My vocabulary" (D43): the model re-extracts definitions on every quiz | Words not stored; no spacing; a paid call for what code can do | **Limited**: code owns the deck; AI only for distractors in multiple choice |
| Themes and ideas quiz | Quiz view: Big ideas, Characters, Who said it?, My ideas; four styles, graded free response (D42–D44) | Missed questions never come back (D42 keeps 30 only for variety) | **Central** |

## 3. Tensions

**Daemons interrupt reading.** Interruptions cost less at task breakpoints than mid-task (Bailey & Konstan 2006; Iqbal & Bailey 2008), and even short ones carry a resumption cost (Mark, Gudith & Klocke 2008). A card appearing while Ronith writes is mid-task, and he wants conversation afterwards. The D37 floor (`mustPick` after 15 lines) even forces a card when nothing cleared the bar, which is pressure toward offloading. *Recommendation:* reading mode by default, daemons silent; a **Reflect** action replaces "React to notes" and runs on the notes written since the last Reflect; the next time a book opens with unreflected lines, offer it once. Keep automatic runs as a gear switch, off by default.

*Strongest case against:* automatic daemons are the demoable novelty, D37 exists because React felt like a chore, and readers may never reflect. *Answer:* the chore was pressing per paragraph mid-writing; one press at a session's end is a different act at a natural break. "The AI waits until you've done the thinking" is a sharper blog thesis than "the margin fills itself". If testers never press Reflect, that's evidence the daemons aren't worth their cost, and the open-time prompt catches the closed-tab case.

**Vocabulary without Define.** Define (D24) would have the AI write the definition, which skips the generation effect (Slamecka & Graf 1978) that Ronith gets from writing it himself. The right shape is the reverse: the reader's own definition lines become a deck. A line like `entail — a settlement passing an estate to male heirs` already appears in the daemon prompt's examples, so the convention exists. Code can parse it, find the book sentence through the D46 quote index, and show *word + book sentence → recall your definition → reveal your words*, scheduled with Leitner boxes (spacing effect; Cepeda et al. 2006). *Recommendation:* deterministic vocabulary deck; Define stays out for good; "My vocabulary" quiz keeps the AI only for multiple-choice distractors.

**After-reading research.** Summarising Reddit and Goodreads is predigestion, the failure the thesis names, and can't be grounded. The Scholar (D39) is already the limited version: one labelled link beyond the book. *Recommendation:* keep it out of the product; at most, later, a plain "Find discussions" link set (search URLs for the title) that sends the reader to do the reading. No AI.

**Quiz easy, daemons hard.** The quiz has a fixed JSON shape, checks our code owns (`checkQuestions`), a clear success signal and a reader-chosen moment. Daemons have none: three prompt rewrites (D37–D39), a reviewer to filter them, and still 33–46-word remarks against a 30-word aim (PLAN S8.2c). Practice testing and distributed practice are the two "high utility" techniques in Dunlosky et al. (2013); elaborative interrogation and self-explanation, which daemons approximate, rate moderate. *Recommendation:* the product's centre is reflect → recall; daemons are a supporting act. Pause S8.3/S8.4 (D40, D41: context recipes and an agent framework) rather than invest more in daemon infrastructure.

**Nothing checks a misreading any more.** D39 stopped daemons correcting, D43 removed "Check my reading", and "My ideas" takes the notes as true. The thesis worries about readers fooling themselves (illusions of competence; Koriat & Bjork 2005). *Recommendation:* later, a Reflect-time "test my claim" action, opt-in; not before feedback.

**Docs and code disagree on caching.** DESIGN §6.3 says the book "is the prefix we prompt-cache" and D37 makes it a rule, but `core/converse.ts` sends no `cache_control`; PLAN S8.2's caching item is unchecked. Also DESIGN §2 goal 3 and §5 step 6 still describe `/define` (removed, D24). *Recommendation:* build caching now; fix the doc lines in the same change.

**Unread source.** Joshi's AI margin-notes study isn't in `docs/research/`, so this memo doesn't lean on it; summarise it there before the blog.

## 4. Core actions

### 4.1 Write (protect it)
- **Moment:** while reading.
- **Reader:** writes thoughts, transcribes quotes (D46), adds page references (D33), writes definitions.
- **AI:** nothing. Forbidden: any call, any card, any suggestion during reading mode.
- **Why:** generative note-taking beats verbatim transcription (Mueller & Oppenheimer 2014; replication mixed, Morehead et al. 2019); offloading lowers what's remembered (Risko & Gilbert 2016).
- **Working if:** share of the reader's own lines (`ownLines`) per session holds or rises; testers report no interruptions.

### 4.2 Reflect
- **Moment:** end of a session, or the next time the book opens.
- **Reader:** presses Reflect; reads the card; clicks it to see the words it answers; writes a follow-up line or dismisses.
- **AI:** daemons draft on the session's notes with earlier notes as context (D39); reviewer shows the best, runners-up one click away (the existing `pool`). Forbidden: writing into notes, summarising, answering reference material, quoting outside works (D39).
- **Why:** elaborative interrogation and self-explanation (Chi et al. 1994; Dunlosky et al. 2013), delivered at a breakpoint.
- **Working if:** testers press Reflect unprompted in a second session; cards lead to new lines in the paragraph they answer.

### 4.3 Recall words
- **Moment:** after reading, and on later days.
- **Reader:** sees a word in its book sentence, recalls their own definition, reveals it, marks known or not.
- **AI:** none. Code parses definition lines, finds the sentence, schedules reviews.
- **Why:** testing effect (Roediger & Karpicke 2006), spacing (Cepeda et al. 2006), and the definition being the reader's own (generation effect).
- **Working if:** words reviewed per week; recall rate rises across boxes.

### 4.4 Quiz ideas
- **Moment:** after a chapter or a session.
- **Reader:** picks topics and styles (D42–D44), answers, reads explanations.
- **AI:** writes questions under `checkQuestions` and `checkCitations`; grades free response (D44). Forbidden: questions whose answer isn't on a cited page or in the notes; revealing beyond `<book_text>`.
- **Why:** retrieval practice; free recall beats recognition, so nudge toward free response.
- **Working if:** repeat quizzes per book; missed questions answered right when they return (needs 4.4's follow-up, §6).

### Escape hatch: Chat
Stays as it is (`prompts/system.md`), book-only (D5). Not a core action.

## 5. How the AI understands the text

| Option | Fits 50K cap (D32) | Cost / latency | Quality | Build | Spoilers |
|---|---|---|---|---|---|
| Whole text (to cap) + caching | Yes | Repeat calls in the cache window much cheaper and faster | No retrieval misses | ~1.5 h: one breakpoint after `<book_text>`, already first (D38) | Sends pages past the reader |
| Structured XML (chapters + pages) | Same | Same | Better navigation, chapter cites | Chapter detection from PDFs is unreliable | Enables a window |
| Reading-position window (regex) | Send the ~50K tokens up to the highest page the notes cite | As cached whole text | No misses in the window | ~2–3 h, code (`core/page-links.ts` finds page refs) | Solves them |
| Keyword retrieval around cited pages | Small payloads | Cheapest | Misses connections across the book, which is the Author's whole job (D39) | ~3 h | Partial |
| Embeddings | Small payloads | New service, key, dependency | Better recall than keywords | Highest; D33 already declined it for cost | Partial |

**Recommendation:** whole text with prompt caching now. Reflect-then-quiz clusters calls at a session's end, when a cache stays warm, so the mode change and caching reinforce each other. Next, a reading-position window (code, no AI) answers Q5/Q12 and closes the spoiler hole the Scholar's prompt only asks it to respect. **What would change it:** the page picker opens for most testers' books (move the window up); low cache-read share in the usage logs (sessions too spread out); eval shows connection quality dropping on long contexts (then retrieval). Check cache pricing and TTL with the `claude-api` skill before quoting numbers.

## 6. Sequenced plan

**Before Oct 16 (today, ~5 h of ~8)**
1. Reading mode: auto daemons off by default, gear switch to turn them on (D47), React → Reflect on unreflected lines, open-time offer. ~2 h
2. Prompt caching on the book prefix + log tokens, cache reads, TTFT per call (Sprint 7's first item, D37's rule). ~1.5 h
3. T4: plain-language error messages and "N replies left" (already planned; testers will hit them). ~1 h
4. Tester questions: three specific asks (did anything interrupt you; did you press Reflect; which quiz style did you use). ~0.5 h

**Oct 19–20 (adjustments, ~6 h)**
1. Vocabulary deck: parser, word list per book, flip cards with the book sentence, Leitner boxes. ~3.5 h
2. Missed quiz questions saved per book and mixed into the next quiz. ~2 h
3. Tune from feedback (Reflect wording, card count). ~0.5 h

**Later (after the blog)**
- Reading-position window (~3 h); eval script and write-up numbers (Sprint 7); opt-in "test my claim" (~2 h); "Find discussions" links (~0.5 h).
- **Cut or paused:** S8.3/S8.4 (D40, D41); daemon floor/`mustPick` for automatic runs; custom daemons and threads (Parking lot stays parked); Define, for good.

## 7. Decisions for Ronith

1. **Reading vs reflecting.** *Recommend:* daemons silent by default; Reflect at a session's end and offered on next open; automatic runs behind a gear switch, off. Alternative: auto with a 2–5 min idle.
2. **What Reflect shows.** *Recommend:* the reviewer's best card, runners-up behind "1 more" from the existing pool; drop the forced floor.
3. **Prompt caching now.** *Recommend:* yes, one breakpoint after `<book_text>`, shared by chat, daemons, quiz and grading.
4. **Vocabulary deck in code.** *Recommend:* parse `word — definition` / `word: definition` lines, deck per book, Leitner spacing, no AI; Define retired. Alternative: AI-extracted "My vocabulary" only.
5. **After-reading research.** *Recommend:* stays out; Scholar is the limited version; maybe plain search links later.
6. **Quiz memory.** *Recommend:* keep missed questions per book and resurface them (a `QuizState` change).
7. **Pause S8.3/S8.4 (D40, D41).** *Recommend:* pause; the reading-position window replaces S8.3's context question.
8. **Context approach.** *Recommend:* whole text + cache now; reading-position window next; no embeddings.
