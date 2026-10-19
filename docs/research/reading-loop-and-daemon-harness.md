# The reading loop and the daemon harness (Claude, 2026-10-16)

Follows [brain-extension-strategy.md](brain-extension-strategy.md) after Ronith's direction of 2026-10-16. These are recommendations only; each numbered decision in §5 goes through `/decide`. Prices were checked with the `claude-api` skill on 2026-10-16. Web search pricing is not in the skill and needs checking before Connect is built.

## 0. What Ronith settled (to log as D48)

- **Notes hold only the reader's words.** The AI never writes a definition or anything else into the notes. Quote autocomplete is allowed because the reader accepts each 3–5 words with a keypress (D46). The app's own fixed text, such as session headings, stays out of the notes too.
- **Daemons are the core value.** They work in service of a reader who does the reading, thinking, synthesising and paraphrasing. They probe, react and extend; they don't replace that work. The previous memo called daemons "a supporting act", and this replaces that framing.
- **The loop is Prepare → Read & write in silence → Reflect → Recall → Connect.**

This loop is close to an old, well-tested study method. PQ4R (Thomas & Robinson 1972) runs Preview, Question, Read, Reflect, Recite, Review, and it extends SQ3R (Robinson 1946). Ronith's version keeps that skeleton and adds Connect.

## 1. Why daemons have been hard: a first-principles diagnosis

A margin companion has to answer four questions before it says anything:

1. What has the reader read?
2. What are they thinking now?
3. What have they thought before?
4. What has already been said to them, and did it land?

Today the harness answers none of these well:

| Question | Today | Consequence |
|---|---|---|
| What has the reader read? | Whatever reference text fits the 50K cap (D32). The app has no idea of reading position. | Daemons can draw on pages the reader hasn't reached. The Scholar's prompt only *asks* it not to spoil (`action-widen.md`). |
| What are they thinking now? | New lines found by line fingerprints after a 25 s pause (`planDaemons`, `core/daemons.ts`) | Runs fire mid-thought, on fragments, at arbitrary boundaries. |
| What have they thought before? | The whole notes file as `<notes>` | Works for short notes. Long notes cost tokens and bury the reader's own thread. |
| What has been said, and did it land? | Nothing. Cards and the pool aren't sent back, and dismissals and clicks aren't recorded. | Daemons can repeat themselves and never learn what this reader engages with. |

There is also no **eval loop**. Each daemon change so far (D37, D38, D39) was judged by eye on a few runs. The quiz felt easy partly because its output can be checked: right or wrong, plus `checkQuestions`. The fix is to make daemon quality checkable too (§3.7).

The single biggest structural fix is a **session**: a bounded stretch of reading with a page range. A session gives every one of the four questions a clean answer, and every stage of the loop hangs off it.

## 2. The user experience

### 2.1 Shape

The loop is not a wizard. A **session strip** sits at the top of the margin and shows where the reader is: `Prepare · Reading · Reflect · Recall · Connect`. Each stage changes what the margin shows. The notes column never changes.

A reader can skip any stage. Only Read is required.

| Stage | Starts when | Margin shows | AI call? |
|---|---|---|---|
| Prepare | Reader presses **Start reading** and types the pages: "pp. 40–62" (or a chapter) | A warm-up from last time, then questions to read with | Yes, one, small |
| Read | Reader presses **Begin** (or skips Prepare) | The questions they chose, and "Daemons will read when you're done." | **None** |
| Reflect | Reader presses **Done reading** | Daemon cards on this session's notes, then a takeaway box | Yes, panel + reviewer |
| Recall | Offered after Reflect, and again at the next Prepare | Quiz view, set by default to this session's pages | Yes (quiz); none for vocabulary |
| Connect | Reader presses **Connect** after Reflect | 2–3 real links, each with why and a question to read it with | Yes, with search |

### 2.2 Prepare

**The reader:**
- Types today's page range. On a paper book the app can't know this on its own, and this one field fixes spoilers, the context window and caching (§3).
- Optionally writes one question of their own before seeing the AI's questions, so the AI doesn't anchor them.

**The app, without AI:**
- Shows a 2–3 question warm-up drawn from last session's missed quiz questions and the reader's vocabulary. This is retrieval spread across days (spacing: Cepeda et al. 2006).
- Lists the reader's own open questions: lines they wrote ending in "?" that are not quotes.

**The AI:**
- Skims today's pages and offers 2–3 broad questions to read with. They point at what to watch for; they never answer it.
- *Forbidden:* summarising the pages, answering its own questions, mentioning anything past the session's end page.

**Why:** pre-questions improve learning of the content they target (the prequestion effect: Richland, Kornell & Kao 2009; reviewed by Pan & Carpenter 2023). They can narrow attention away from everything else, so keep them few and broad.

The reader ticks the questions they want to carry. Those stay in the margin while reading. Nothing goes into the notes unless the reader types it.

### 2.3 Read & write in silence

- No AI calls.
- The quiet tools stay on: quote autocomplete (D46) and page pills (D45).
- Automatic daemon runs (D37) become a gear switch, off by default.

**Why:** an interruption costs least at a natural break and most mid-task (Bailey & Konstan 2006; Mark, Gudith & Klocke 2008).

### 2.4 Reflect (the daemons' home)

**Done reading** sends the session's new lines to the daemons, with everything earlier as context.

**What the margin shows:**
- **Up to three cards**, at most one per daemon, in the reviewer's order.
- The reviewer can still show none. The D37 rule of one card fit a margin that interrupted; Reflect is a deliberate stop, so a little more fits.

**Answering a card:**
- **Answer in my notes** puts the caret at the end of the paragraph the card answers, and the reader writes there.
- The card is marked *answered* when new lines of the reader's own appear in that paragraph.
- This keeps the reader's answer in their own file, in their own words (self-explanation: Chi et al. 1994), and avoids reviving thread replies (removed by D37).

**Closing the session:**
- The app shows a fixed prompt, which is plain app text, not AI: **"Your takeaway: what did these pages change in your thinking?"**
- The reader writes 1–2 sentences.
- **Add to notes** pastes them verbatim; they are the reader's words and the reader's click.
- The takeaway is the reader's own synthesis, and it becomes the harness's memory (§3.4).

### 2.5 Recall

- The Quiz view (D42–D44) as it is, with today's pages as the default scope.
- Two additions:
  - **Missed questions return** in later quizzes and in the next Prepare warm-up.
  - **A vocabulary deck in code** built from definition lines the reader wrote (`word — definition`). Each card shows the word in its book sentence; the reader recalls their own definition, then reveals it. No AI, and nothing is written into the notes.

**Why:** testing effect (Roediger & Karpicke 2006) plus spacing (Cepeda et al. 2006).

### 2.6 Connect

**The reader:** presses **Connect** after Reflect.

**The AI:**
- Searches from the reader's takeaway and the cards they answered, and returns 2–3 links. Each has a title, the source, one line on why it bears on *their* note, and one question to read it with.
- *Forbidden:* summarising what the source says beyond one line, any URL that didn't come back from a search, quoting the source.

**Spoilers are the real risk.** Reddit and Goodreads threads usually discuss the whole book.
- Mid-book: academic papers, other works and history only.
- Discussions and reviews: unlocked once the reader marks the book finished.
- Each link is tagged with its spoiler risk.

**Why:** elaboration and transfer, linking new material to other knowledge. The reader still does the reading.

**What happens to the Scholar:** its job moves here. In the margin it brings outside knowledge with no source (D39's accepted cost). In Connect, every outside claim arrives with a real URL. Reflect keeps The Author and The Devil's Advocate, both book-only.

## 3. The harness

### 3.1 A stage is a row

The harness should be another data table, like `COMMANDS` and `DAEMONS`, rather than an agent framework. This answers S8.4 / D41 with no LangChain. Each row says:
- what triggers the stage;
- which context recipe it uses;
- its prompt file;
- its output schema;
- its checks;
- where its output lands.

| Stage | Context recipe | Output | Checks | Lands |
|---|---|---|---|---|
| prepare | book window, session pages, reader's open questions | 2–3 questions (JSON) | no quote past the end page; no answer | margin |
| reflect-panel | book window, earlier takeaways, session notes, margin history | nugget or pass per daemon (JSON) | `checkCitations`, anchor is the reader's own words, length | reviewer |
| reflect-review | excerpt, candidates, cited pages (no book) | ordered picks (JSON) | — | margin |
| quiz / grade | as today (D42, D44), book window instead of the whole text | as today | as today | Quiz view |
| connect | takeaway, answered cards, book title; web search tool | 2–3 links (JSON) | URL appears in the search results; spoiler tag | margin |
| chat | book window, notes, history | text | `checkCitations` | chat |

### 3.2 The book model

Code builds this once, on import, and stores it with the book in IndexedDB.

**Pages:**
- `parsePages` already splits pages (D38).
- Add the paper-page offset that D33 already learns.

**Chapters:**
1. From the PDF's own outline (pdfjs `getOutline` plus `getPageIndex`).
2. Failing that, heading patterns ("CHAPTER IV", "3.").
3. Failing that, none.

**The XML the model sees:**

```xml
<book title="…" author="…">
  <chapter n="3" title="…" pages="40–62">
    <page n="40">…</page>
  </chapter>
</book>
```

Chapter tags cost a few tokens. In return the model can say "in chapter 3", and the app can choose text by chapter.

**Later, only for books over the window:** a per-chapter index that an AI writes once, listing each chapter's key passages with exact quotes (checked by `checkCitations`), the people introduced and the threads opened. It is internal: never shown to the reader, so it predigests nothing for them. It lets daemons reach far-back chapters without sending them.

### 3.3 The window: what the AI sees of the book

All code, no AI:
- **Send pages 1 through the session's end page.**
- **If that's over ~50K tokens:** the index for older chapters plus the last ~40K tokens of text, taken whole by chapter.

This is spoiler-safe by construction: no call ever sees past where the reader is.

It also retires the page picker (D32 stays as the token ceiling) and answers Q5 and Q12: long context for what fits, an index for what doesn't, no embeddings.

### 3.4 The reader model

Saved per book, all in plain code:

- **Sessions:** page range, start time, the line fingerprints at the start (so "this session's lines" is exact), the takeaway, the cards and what happened to each, the quiz results.
- **Open questions:** the reader's own lines ending in "?", plus the Prepare questions they kept.
- **Margin history:** the last ~15 cards with their outcome (answered, highlighted, dismissed, ignored). It's sent as `<margin_history>` so daemons don't repeat themselves and lean toward what this reader engages with.

**When the notes outgrow the budget,** send this session's notes in full plus every earlier takeaway and the open questions, instead of the whole file. The reader's own takeaways compress their thinking. An AI summary of the notes is avoided because it is exactly where words get put in the reader's mouth (D39 forbids that).

### 3.5 Prompt order and caching

Facts from the claude-api skill, for Sonnet 5.5:

| Item | Price |
|---|---|
| Input | $2.00 / MTok |
| Cache read | $0.20 / MTok (0.1×) |
| Cache write, 5-minute entry | 1.25× input |
| Cache write, 1-hour entry | 2× input |

Other caching facts:
- Up to 4 breakpoints per request.
- A prefix below the model's minimum size silently doesn't cache.
- Check `usage.cache_read_input_tokens` to confirm hits.

**Order** (the book is already first, D38):
1. `<book>` window (**breakpoint 1**)
2. stage role prompt (**breakpoint 2**, for the daemon panel)
3. reader model + notes
4. task

**Why the session makes caching work:** the window is fixed for the whole session, because the page range comes from Prepare. Reflect, Recall and Connect follow within minutes of each other, so the default 5-minute entry stays warm. There is one write per session.

**Rough cost for a 50K-token window** (book input only; output and smaller calls not counted):

| | Book input for ~4 calls |
|---|---|
| Uncached | ~40¢ |
| Cached | ~12.5¢ write + ~3¢ reads ≈ 16¢ |

The code doesn't cache today: `core/converse.ts` sends no `cache_control`, although DESIGN §6.3 and D37 say it should.

### 3.6 Connect's sourcing

**Option A: the web search server tool.**
- `web_search_20260209` is supported on Sonnet 5.5.
- `allowed_domains` limits it: e.g. `plato.stanford.edu`, `jstor.org`, `goodreads.com`, `reddit.com`, gated by spoilers (§2.6).
- `max_uses` set to 3–5.
- Our code keeps only URLs that appear in the `web_search_result` blocks.
- Errors arrive as result blocks, not exceptions.

**Option B: OpenAlex for papers.**
- OpenAlex is a free scholarly index with no API key.
- Our route queries it with keywords from the takeaway, and the model picks and explains.
- Real metadata, no per-search fee. It covers papers only.

**Recommendation:**
- A for discussions and reviews; B for papers.
- Spike first: confirm web search works together with structured outputs. Citations do not (a 400).

### 3.7 The daemon eval loop (before more prompt tuning)

**Fixtures:**
- 3 public-domain books.
- Sessions of real notes from Ronith, ~10 sessions in all.

**Deterministic checks, scored by script:**
- Every quote passes `checkCitations`.
- The anchor is the reader's own words, not a quote or a definition line.
- ≤30 words.
- No page past the session's end.
- No phrase attributed to the reader that isn't in the notes.

**Judged checks:**
- Ronith labels ~30 cards as extends / restates / corrects / off.
- An LLM judge is calibrated to agree with his labels, then scores every prompt change.

**Live signals from testers**, all local:
- the share of cards answered in the notes;
- whether Reflect gets pressed again in a later session;
- takeaway length.

This is what turns "daemons are hard" into hill-climbing.

## 4. Sequence

**Today (Oct 16), only if testers haven't started in earnest:** ~3.5 h
- Automatic daemon runs off by default behind a gear switch; React to notes becomes **Done reading**. ~1.5 h
- Prompt caching on the book block, and log usage per call. ~1.5 h
- Ask testers three things: did anything interrupt you, did you press Done reading, did a card make you write more. ~0.5 h

**Oct 19–20:** ~7 h
- The session: Start reading with pages, Prepare without AI questions yet (warm-up + open questions), session-scoped Reflect, the takeaway box. ~3.5 h
- The window by end page + chapters from the PDF outline. ~1.5 h
- Daemon eval fixtures and the deterministic checks. ~2 h

**Blog (Oct 21–22):** the story is the loop, with the measured caching and eval numbers.

**Later:**
- Prepare's AI questions. ~1.5 h
- Margin history in the panel. ~1 h
- Up to three cards and Answer in my notes. ~1.5 h
- Connect with search. ~5 h
- Vocabulary deck. ~3.5 h
- Missed questions return. ~2 h
- Chapter index for long books. ~3 h

## 5. Decisions for `/decide`

1. **Log D48:** the five-stage loop; daemons are the core; the notes hold only the reader's words, with autocomplete the one accepted exception.
2. **Session = a page range the reader enters at Start reading.** It is metadata, never text in the notes. *Alternative:* infer it from the highest page referenced in the notes.
3. **Silence while reading:** automatic daemon runs off by default, behind a gear switch.
4. **Reflect shows up to three cards** (at most one per daemon), and the reviewer can still show none. *Alternative:* keep D37's single card.
5. **A card is answered in the notes** (caret to the paragraph, answered when new own lines appear). *Alternative:* thread replies under the card.
6. **The takeaway box** with fixed app text and Add to notes. *Alternative:* the reader types "Takeaway:" in the notes themselves, and code finds it.
7. **Prepare:** the reader's own question first, then 2–3 AI questions; the warm-up comes from missed questions and vocabulary.
8. **The window:** pages 1 to the session's end page, chapters from the PDF outline, a cache breakpoint after the book; the page picker retires.
9. **Reader memory:** takeaways, open questions and margin history, and no AI summary of the notes.
10. **The Scholar becomes Connect:** verified URLs only; reviews and discussions only after the book is finished. *Alternative:* keep the Scholar in the margin as well.
11. **A daemon eval set** before any more daemon prompt tuning.
12. **Vocabulary deck** in code from the reader's own definition lines (unchanged from the previous memo; it writes nothing into the notes).
