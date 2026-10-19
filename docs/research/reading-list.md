# Reading list: harness, evals, reading interfaces

Collected 2026-10-16 for designing the reading loop and the daemon harness ([reading-loop-and-daemon-harness.md](reading-loop-and-daemon-harness.md)). Ordered by how much each helps us now: read top to bottom. Tick an item when it's read; add thoughts under it.

## Tier 1: read first (shapes the daemon design directly)

1. - [x] [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) (Anthropic, Sept 2025)
   Context rot, minimal prompts, canonical examples, just-in-time retrieval, notes as memory.
   - Claude should read this article when designing the tools information file: https://www.anthropic.com/engineering/writing-tools-for-agents
   - Create a tools_utils.py file that lets the agent know what tools it has access to
   - Prompt engineering insufficient when looking at more capable agents over a longer time horizon across the entire context state (system instructions, tools, MCP, external data, message history, etc)
   - context rot — model decreases in accurate information recall as number of tokens in context window increases
   - Good context engineering = finding the smallest possible set of high-signal tokens to maximize likelihood of desired outcome
   - Anatomy of an effective context
      System prompts — clear, simple, direct language presenting ideas at right altitude for agent
      Don’t want complex, brittle logic to elicit exact agentic behavior because create fragility and increased maintenance complexity over time
      Don’t want vague high-level guidance that doesn’t give LLM concrete signals for desired outputs or falsely assumes shared context
      Want to give the agent specific instructions to guide behavior effectively yet also flexible enough to provide model with strong heuristics to guid its behavior
      Organize prompts into distinct sections + XML tagging or markdown headers to delineate sections
      Tools — giving agents ability to operate in environments to pull in new, additional context as they work
      Build tools that are well understood by LLMs and have minimal overlap in functionality
      Continue to advise providing examples through few-shot prompting but don’t necessarily need to provide a laundry list of edge cases. Focus on creating a set of diverse, canonical examples to effectively portray expected behavior of the agent
      “For an LLM, examples are the ‘pictures’ worth a thousand words”

      Shift in AI-native applications to go from embedding-based pre-inference time retrievals towards more agentic approaches that use “just in time” context strategies
      Avoiding pre-processing means you can rely on lightweight identifiers (file paths, stored, queries, web links, etc) and use these reference dynamically to load data into context at runtime using tools => write targeted queries, store results, and leverage Bash commands
      Beyond storage efficiency, the metadata of these references provides mechanism to refine behavior
      Also allows for progressive disclosure (letting agents incrementally discover relevant context through exploration) so that they inform the next decision
      Trade-off is that runtime exploration is slower than retrieving pre-computed data
      For context engineering for long-horizon tasks:
      Compaction — reinitiate a new context window with a summary of the conversation nearing the limit
      Structured note-taking — allow agent to track progress across complex tasks by letting agent regularly write notes in a memory persisted outside of context window so that they can get pulled back into context window at later times
      Sub-agent architectures — use clear separation of concerns to create specialized sub-agents to handle focused tasks with clean context windows where one agent coordinates with a high-level plan while subagents do the deep technical work or use tools to find relevant information, exploring extensively but then only returning a condensed, distilled summary of its work



2. - [x] [Language Model Sketchbook, or Why I Hate Chatbots](https://adactio.com/tags/sketches) (Maggie Appleton; also [Shop Talk #583](https://shoptalkshow.com/583/))
   The original Daemons: background personas as "epistemic rubber ducks" for reflective thinking.
   - Language models as a sort of “rubber duck” to help strengthen our own critical thinking and reasoning abilities in the way a debate partner does
Daemon - characters that have particular personalities (devil’s advocate, complimenter, encourager, synthesizer, researcher, elaborator)

I like the idea of daemons coming alive in the background based on the content of my notes
The daemons come alive throughout the text with questions / reactions
They pose a question based on what they notice in your writing and then you react to it

3. - [x] [Designing and Evaluating AI Margin Notes in Document Reader Software](https://arxiv.org/pdf/2509.09840) (arXiv 2509.09840; likely the Joshi study)
   AI notes tied to passages, compared against a separate chat window.
   - AI margin notes integrated with texts => select text manually and automated through AI
Generation of margin note can involve AI to various degrees
Commenting feature to provide something 
Have a variety of system prompts / users prompts based on the actions that you want to offer

Look into best practice on this topic, think there is something more robust we can try

Idea of the fill in the blank is interesting but ultimately think a poor fit for my needs since it feels more like go search for the answer than testing for real understanding
Notes are critical for enabling re-reading to reinforce memory and for facilitating learning (storage and encoding functions)
Theory behind why integration is better than separate chat UI: referring to specific parts of documents creates additional work, shifting attention to separate interface distracts from reading, referring back to specific responses requires additional work
For Tertulia: for the margin notes, we should make it clear what is user prompt vs llm response. Participants can type a prompt and press the blue  confirm button. then the user prompt should appear at the top of the comment in gray with italicized text and a dashed border around it. the response can appear below in black text with a sparkle icon to distinguish human-written text from AI-written text
Should think about the different options I want to eventually have and what to initially focus on

Key insights
Our results indicated that AI margin notes were preferred over chat interfaces and that selecting text for AI margin notes should be done manually
When compared to generating practice questions without assistance, receiving questions that were generated by the assistant led to higher reading comprehension scores
Using deictic language (pointing or showing directly) is often easier than fully articulated descriptions


4. - [ ] [Demystifying evals for AI agents](https://anthropic.com/engineering/demystifying-evals-for-ai-agents) (Anthropic, Jan 2026)
   Code, model and human graders; capability vs regression evals.
   - *Thoughts:*
5. - [x] [Your AI Product Needs Evals](https://simonwillison.net/2024/Mar/31/your-ai-product-needs-evals/) (Hamel Husain, via Simon Willison's summary, 2024)
   Read traces, label failures, write a check per failure; judges only once calibrated.
   - Read through all the links on this website to udnerstand how to create a robust eval suite from zero to hero: https://hamel.dev/notes/llm/evals/start/new-to-evals/

5a. - [ ] [LLM Evals: Everything You Need to Know (FAQ)](https://hamel.dev/blog/posts/evals-faq/) (Husain & Shankar) and [LLM-as-a-judge](https://hamel.dev/blog/posts/llm-judge/)
   Error analysis first; binary verdicts; judges validated by true positive/negative rates. Notes: [evals-faq-notes.md](evals-faq-notes.md).
   - *Thoughts:*

## Tier 2: read next (the harness's structure and prompt layout)

6. - [ ] [Long context prompting tips](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/long-context-tips) (Anthropic docs)
   Documents first, query last, XML per source, pull quotes before answering.
   - *Thoughts:*
7. - [ ] [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (Anthropic, Dec 2024)
   Workflows vs agents; routing, parallelization, evaluator-optimizer; skip frameworks, call the API.
   - *Thoughts:*
8. - [ ] [Harness engineering](https://martinfowler.com/articles/harness-engineering.html) (Böckeler, martinfowler.com, 2026)
   Guides steer the model before it acts; sensors check its output after.
   - *Thoughts:*
9. - [ ] [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (Anthropic, Nov 2025)
   State across sessions: start-of-session routine, one unit per session, JSON progress.
   - *Thoughts:*
10. - [ ] [Evals, error analysis and better prompts](https://www.lennysnewsletter.com/p/evals-error-analysis-and-better-prompts) (Husain & Shankar, Lenny's Newsletter)
    Step-by-step error analysis: how to find what's actually going wrong.
    - *Thoughts:*

## Tier 3: background and vision (read when you have time)

11. - [ ] [Why Books Don't Work](https://andymatuschak.org/books) (Andy Matuschak, 2019)
    Books lack a theory of learning; the mnemonic medium weaves review into text.
    - *Thoughts:*
12. - [ ] [The Semantic Reader Project](https://cacm.acm.org/research/the-semantic-reader-project) (CACM, Oct 2024)
    Ten AI reading-interface prototypes, studied with 300+ users.
    - *Thoughts:*
13. - [ ] [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/) (OpenAI, Feb 2026)
    Origin of the term: environments and feedback loops matter more than prompts.
    - *Thoughts:*
14. - [ ] [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) (Dex Horthy / HumanLayer, GitHub)
    Own your context window and control flow; argues for our own stage table.
    - *Thoughts:*

## Tier 4: only when a specific need comes up

15. - [ ] Drew Breunig, [How long contexts fail](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html) and [How to fix your context](https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html) (2025)
    Named failure modes of long contexts. Read if daemons degrade on long books.
    - *Thoughts:*
16. - [ ] [Who Validates the Validators?](https://arxiv.org/abs/2404.12272) (Shreya Shankar et al., 2024)
    Grading criteria shift as you look at outputs. Read when building the eval rubric.
    - *Thoughts:*
17. - [ ] [Introducing Contextual Retrieval](https://anthropic.com/news/contextual-retrieval) (Anthropic, Sept 2024)
    Retrieval for documents too long for context. Read if books outgrow the window.
    - *Thoughts:*
