# Day 0: Homework

Not counted in the 21 h. Seeds `prompts/system.md` and DESIGN.md §5. Do not paste book text here (copyright); quote only short spans.

## 1. Manual test (30 min)

- **Book / chapter:** I Who Have Never Known Men
- **Where the text lives locally (`books/...`):** Lives in folder called books/
- **Model / app used:** I tried using Claude chat

### What I tried
- [x] Asked it to push back on a note that misreads the passage
- [x] Asked it to define a term
- [x] Asked it to expand a terse note
- [x] Asked a question the text does not answer

### Transcript highlights
<!-- Short excerpts only. Mark which lines are yours and which are the AI's. -->

No particular great highlights to show

### What worked
- Processes the book text I provided quickly
- When I asked it about a made up character's action, it didn't make it up or hallucinate

### Where it invented or drifted
<!-- Fake quotes, wrong paragraphs, outside knowledge presented as the book's. -->
- Overly verbose in most responses and doing too much without being directed to


### What I wish it had done
- Reacted to what I had said from teh onset rather than trying to lead the conversation. It should have taken signals from my notes and quotes as starting point for the conversation
- when I say /define, I want it to automatically provide a definition for the word and then also pull in the example sentence from where I found it in the book
- It should also offer a quiz that I can take to test my understanding of the word in different contexts, similar to what Merriam Webster dicitonary offers online (open to using their API for this if they have one)
- I want a tool that acts to augment my understanding and psuhes me to think beyond my initial observations about underlying meanings and connections rather than substituting that thinking
- I'm not a fan of the UI flow / style when trying to have this conversation in Claude's app where the experience feels stilted and overwhelming. Claude's response overwhelms what I have to stay. I think the chat conversation should on the side and revisiona nd AI notes should be sparse when added to the user's md file
- Be able to pull insights and thinking by crowdsourcing from Goodreads and Reddit on the books discussion to offer counterpoints to the direction of the reader when important
- Automatically change the level of the model used (e.g., Sonnet vs Opus) based on the difficulty of the task I'm asking it to do
- Similar to Cursor, want the ability to choose from multiple different models and interchange them as necessary
- Because prior beliefs inherently color the perspective that someone brings to their experience of reading the book, there should be the ability to pick the personality / member from the "book club" / tertulia. For example, someone who is more sympathetic to feminist cause vs someone who is more skeptical
- The archetypes for the book will vary but it should choose the top five and carft real personlaity and persepctive to them. Ths=ese personlaities can be cultivated from online analysis and reviews as well as from Goodreads and other reviews

## 2. Competitor comparison (≤1 h, same chapter)

### NotebookLM
- Does well: Big fan of the UI that shows the source on LHS + option to search web. Main notebook in center . RHS shows panels of actions that you can take. I like the buttons on the side that give you the option to choose from "Quiz", "Flashcard", "Mindmap", and "Reports". I want something similar for this application (e.g., having a quiz on the new / challenging vocabulary in the book, reading comprehension quiz, mindmap of how the chracters are connected and who is friends with who). Also like how there is ane xplanation shown for why each choice is right or wrong after the user selects a choice + allows you to select easy / medium / hard difficulty. There is also an explain button you can click when you want to know more about a specific question that gives the agetn context so that you get a deeper explanation (e.g., context that there is a quiz you are taking + whether you choose the correct or incorrect answer + "help me understand this topic better")
- Does badly: Main interface / chat log gets cluttered with too much that should stay in the chat instead. much less should make it into the "artifact" and instead it should just be my notes mainly with select snippets I highlights from the ai tool to add

### Readwise Reader (Ghostreader)
- Does well: Prebuilt prompts / skills (e.g., generate thoughtful questions) along with the way to choose with chat. Ability to track progress in the book. Ability to create highlights and track them both by selecting the text and coping and pasting them
- Does badly: Poorly designed for someone who wants to maintain the paperbook experience with an easy touse companion on the side that tracks along the notes for you and has the conversation with needing the book / pdf text as the central things in the app

### What competitors get wrong
<!-- This list is part of the Day 0 verify line. -->
1. Poor agentic harness. Should have a more of a cornell method note taking style where instead of "questions" it is AI isnights and provocative questions to improve the users thinking based on the the content shown in the main notes / key thoughts
2. Poor delineation between user generated / tracked content vs what AI is adding
3. Focus on trying to keep visual / in app reading expereince rather than companion app

## 3. Draft system prompt
<!-- Ronith's words. This seeds prompts/system.md. -->

```
<role>
You are a close reader and literary partner for one book. You are detail-oriented but never lose the book's larger arguments. The user is reading this book and sending you passages and notes; your job is to deepen *their* reading, not to deliver the consensus one.
</role>

<book>
Title: {{title}} | Author: {{author}} | Edition: {{edition}}
The reader has reached: {{progress_page}} (do not reveal or hint at anything after this page unless they ask).
The full text, with page markers, is provided in <book_text>. The printed page numbers are the ones to use.
</book>

<how_to_engage>
1. The user leads. Start from the passage or note they sent. Amplify what caught their attention, even if it's an unusual angle, and don't redirect to the standard reading.
2. Default to supporting and sharpening: restate their idea in its strongest form, then add textual evidence they haven't used.
3. Push back when the text doesn't support them or when they contradict themselves. Name the specific tension (a passage that complicates their claim, or two passages that conflict) and give the best version of their position afterward. If they ask for a bolder or more adversarial mode, go further.
4. Connect passages across the book. The most useful thing you can give is a link the user hadn't made.
5. Reply in conversational prose, usually 150-400 words. Don't summarize the plot. End with one specific question that depends on their own reading.
</how_to_engage>

<grounding_rules>
Every claim about what the book says, does, or contains needs a page citation in the form (p. 101), plus a short direct quote (under ~25 words) when the wording matters.

Classify each statement as one of:
- **Text**: stated on the page. Quote and cite.
- **Interpretation**: your inference from the text. Label it ("I'd read this as...") and cite the passages it rests on.
- **Outside the text**: author biography, criticism, the afterword, history. Say so and name the source. Never present it as something the book says.

If a passage doesn't support an answer, say "Not in the text" and then say what the text does support, if anything. Don't fill the gap with a plausible guess.

Before quoting, searching for a name, or claiming something is absent, search the book text itself. If the user's question assumes a character, event, or word that isn't in the book, say so plainly. If you can't determine a page number, say so. Never guess one. Page numbers and quotes must match the text exactly.
</grounding_rules>

<examples>
<example>
User: This shows the women just need their children and are held back without them. (101)
Good reply (shape): Disagrees with the "need" reading using Anthea's explanation (p. 101: "They don't want to think about their children"), labels the move to patriarchy as an inference the passage doesn't support ("Not in the text": nothing on p. 101 mentions men or authority), then offers the strongest version of the user's idea and asks one question.
</example>
<example>
User: What does Anthony the guard do that's surprising?
Good reply (shape): "No character named Anthony appears in the text. Possibly you mean Anthea (a woman) or the unnamed young guard. Here's the surprising thing the guards do (p. X: quote)..." then asks which was meant.
</example>
</examples>

<commands>
If the user types "define <word>": give a brief definition, then every place the word appears with page and short quote. If "quiz": ask 3 questions grounded in their notes, each answerable from cited pages.
</commands>

```

## 4. Open questions (DESIGN.md §10)

Each answer becomes an entry in DECISIONS.md via `/decide`.

- **Q1 Storage:** 
- **Q2 Outside knowledge:** 
- **Q4 Hosting:** 
- **Q6 Write-up audience:** 
- **Q7 Day-0 findings (does this change §5?):** 
