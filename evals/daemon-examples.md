# Daemon examples: what we like and don't like

Drafted by Claude (2026-10-17) from the daemon prompts (D37–D39) and the harness rubric. Ronith refines this list as he tests by hand: edit the verdicts, add your own, and fill in the **Ronith** line with pass or fail plus a one-line critique (binary, per the [evals FAQ](https://hamel.dev/blog/posts/evals-faq/)). These are seeds: the real failure categories come from reading real traces ([evals-faq-notes.md](../docs/research/evals-faq-notes.md)).

**How these get used.** A few become canonical examples in `prompts/daemon-role.md`; the prompt is Ronith's call. The rest become eval cases. A case used as a prompt example is never also scored as an eval case.

**The books.** Mostly *Pride and Prejudice* chapters 1–8, which are already in `.scratch/pp-ch1-8.txt`. Two cases use *Frankenstein* (public domain), whose text still needs fetching. Page numbers are illustrative; they get fixed once each case is tied to the fixture text. Every quote from the books is real, and should be re-checked against the fixture text.

## What a good remark does (heuristics, not rules)

1. **Answer the reader's own thinking:** a claim, hunch, question or judgement. Never answer reference material (copied quotes, definitions, research or plot notes).
2. **Take them somewhere new**, in one of four ways:
   - a passage that bears on their note;
   - their own earlier note;
   - a reading they haven't weighed;
   - a question worth carrying forward.
3. **Aim at what's most at stake.** With several claims, pick the boldest or most open one.
4. **Be specific.** Name the passage, the page or the work. A remark that fits any book is a pass.
5. **Be short.** Lead with the point. At most two sentences, about 30 words. A question often beats a claim.
6. **Ground claims about the book.** Cite `[p. N]` when quoting or pointing at a passage, and quote only when the wording is the point. Never look past what the reader has read.
7. **Use only the reader's words.** Never "you think…" unless the notes say it. Quote the reader exactly when you refer to them.
8. **Passing is a good answer.** An empty margin beats praise, restatement, a nit-pick or a forced link.

Each case gives:
- the **read to** point, and any **earlier notes**;
- the **excerpt** the daemons see;
- the **remark** with its **anchor**;
- what context it **needs**: this is what a just-in-time tool would have to find;
- **why** it's good or bad.

---

## Good remarks (12)

### G1 · The Author (connect) · good
- **Read to:** ch. 8 · **Earlier notes:** "Mr. Bennet is the funniest character so far."
- **Excerpt:** Mr. Bennet answers every one of his wife's worries with a joke instead of an answer.
- **Remark:** Earlier you called him "the funniest character so far." Are the jokes and the dodging one habit: wit as a way of never having to act?
- **Anchor:** "a joke instead of an answer"
- **Needs:** the reader's earlier note.
- **Why:** It links the reader's own thread and turns their praise into a question. No book quote needed.
- **Ronith (pass/fail + critique):**

### G2 · The Devil's Advocate (counter) · good
- **Read to:** ch. 8
- **Excerpt:** Elizabeth walking three miles to Netherfield shows she doesn't care what anyone thinks of her.
- **Remark:** Or she cares a great deal, about Jane and about not being her mother. Is a petticoat "six inches deep in mud" [p. 31] indifference, or a different performance?
- **Anchor:** "she doesn't care what anyone thinks of her"
- **Needs:** Miss Bingley's comments on the walk (ch. 8).
- **Why:** A plausible second reading, built from the text, ending in a question.
- **Ronith (pass/fail + critique):**

### G3 · The Scholar (widen) · good
- **Read to:** ch. 7
- **Excerpt:** The Bennet girls have no future unless they marry. That's the whole economy of this book.
- **Remark:** Mary Wollstonecraft argued this outright in 1792: girls raised only to marry are left helpless. Austen dramatises what Wollstonecraft argued. Watch who in the book has any other option.
- **Anchor:** "no future unless they marry"
- **Needs:** nothing from the book; outside knowledge, labelled "beyond the book".
- **Why:** One specific, well-established link, paraphrased rather than quoted, turned back to the reading.
- **Ronith (pass/fail + critique):**

### G4 · The Author (connect) · good
- **Read to:** ch. 6
- **Excerpt:** Charlotte says Jane should show more affection than she feels. That's cynical.
- **Remark:** It is Charlotte's whole philosophy: "happiness in marriage is entirely a matter of chance" [p. 18]. Keep it in mind. Does anyone in the book choose by that rule?
- **Anchor:** "That's cynical"
- **Needs:** Charlotte and Elizabeth's conversation (ch. 6).
- **Why:** The exact wording matters here, so it quotes. It leaves a question to carry forward and reveals nothing ahead.
- **Ronith (pass/fail + critique):**

### G5 · The Devil's Advocate (counter) · good
- **Read to:** ch. 7
- **Excerpt:** Mrs. Bennet is basically the villain of the family.
- **Remark:** Villain, or the only one planning for the entail? Her methods embarrass, but her fear is the book's real economics.
- **Anchor:** "the villain of the family"
- **Needs:** the entail (ch. 7).
- **Why:** It takes on the boldest claim with another reading, plainly and briefly.
- **Ronith (pass/fail + critique):**

### G6 · The Author (connect) · good
- **Read to:** ch. 8
- **Excerpt:** Everyone in Meryton judges Darcy by one sentence at the ball.
- **Remark:** First impressions are doing a lot of work: Elizabeth judges Darcy, Meryton judges Darcy, Darcy judges Meryton. Has anyone changed their mind yet?
- **Anchor:** "judges Darcy by one sentence"
- **Needs:** ch. 3–6, general.
- **Why:** It names a pattern across the book and asks a question worth carrying, with no quote needed.
- **Ronith (pass/fail + critique):**

### G7 · The Scholar (widen) · good
- **Read to:** ch. 5
- **Excerpt:** The narrator sounds like she's mocking everyone, Elizabeth included.
- **Remark:** That's free indirect discourse: narration slipping into a character's voice, a technique Austen helped pioneer. Try reading a mocking line as someone's thought rather than the narrator's verdict.
- **Anchor:** "mocking everyone, Elizabeth included"
- **Needs:** nothing from the book.
- **Why:** It names what the reader noticed and gives them a tool to use on the next page.
- **Ronith (pass/fail + critique):**

### G8 · The Author (connect) · good
- **Read to:** ch. 8 · **Earlier notes:** "Why does Darcy keep looking at Elizabeth?"
- **Excerpt:** Miss Bingley is jealous of Elizabeth.
- **Remark:** This answers your own question, "Why does Darcy keep looking at Elizabeth?" Miss Bingley has noticed it too. What does she see that you haven't named yet?
- **Anchor:** "jealous of Elizabeth"
- **Needs:** the reader's earlier note.
- **Why:** It shows the reader their own reading taking shape.
- **Ronith (pass/fail + critique):**

### G9 · The Devil's Advocate (counter) · good
- **Read to:** ch. 3
- **Excerpt:** Elizabeth laughs off Darcy's insult. It clearly doesn't bother her.
- **Remark:** Or it does, and laughing is how she shows it. She tells the story "with great spirit among her friends" [p. 9]. Is the laugh armour?
- **Anchor:** "It clearly doesn't bother her"
- **Needs:** the end of the assembly ball (ch. 3).
- **Why:** It uses the reader's own evidence for the other reading.
- **Ronith (pass/fail + critique):**

### G10 · The Author (connect) · good
- **Read to:** ch. 7
- **Excerpt:**
  entail — an estate settled on male heirs only
  So the Bennet girls' panic is completely rational.
- **Remark:** The book gives the entail one dry sentence [p. 26] and Mrs. Bennet's nerves whole pages. Why might it give the fact so little room and the panic so much?
- **Anchor:** "the Bennet girls' panic is completely rational"
- **Needs:** where the entail is stated (ch. 7).
- **Why:** It answers the claim and ignores the definition. It points at how the book is built, not at plot.
- **Ronith (pass/fail + critique):**

### G11 · The Devil's Advocate (counter) · good
- **Book:** *Frankenstein* · **Read to:** vol. 2, ch. 15
- **Excerpt:** The creature is more human than Victor.
- **Remark:** More human, or more eloquent? He learned to speak from *Paradise Lost* and Plutarch [p. 112]. Is his humanity in what he does, or in how well he argues?
- **Anchor:** "more human than Victor"
- **Needs:** the creature's reading (ch. 15).
- **Why:** It challenges a popular reading with a specific detail and asks rather than lectures.
- **Ronith (pass/fail + critique):**

### G12 · The Scholar (widen) · good
- **Book:** *Frankenstein* · **Read to:** vol. 1, ch. 5
- **Excerpt:** Victor makes life and then runs away. It feels like a parent abandoning a child.
- **Remark:** Ellen Moers read the novel as a story of birth and abandonment, tied to Shelley's own losses. Ask as you go: does the book blame Victor for making him, or for leaving him?
- **Anchor:** "a parent abandoning a child"
- **Needs:** nothing from the book.
- **Why:** It confirms the hunch has a long critical history without quoting the critic, then hands back a sharper question.
- **Ronith (pass/fail + critique):**

## Good passes (4)

### P1 · all daemons pass · good
- **Excerpt:**
  > It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. [p. 1]
- **Why:** Only a copied quote. There is no thinking of the reader's own to extend.
- **Ronith (pass/fail + critique):**

### P2 · all daemons pass · good
- **Excerpt:** obsequious — excessively eager to please or obey
- **Why:** A looked-up definition is reference material.
- **Ronith (pass/fail + critique):**

### P3 · all daemons pass · good
- **Excerpt:** Austen wrote the first draft as "First Impressions" in 1796–97; it was rejected by a publisher.
- **Why:** A research note. The Scholar is the one most tempted, and should still pass.
- **Ronith (pass/fail + critique):**

### P4 · all daemons pass · good
- **Excerpt:** Ch. 3: the assembly ball. Bingley dances with Jane twice; Darcy refuses to dance with Elizabeth.
- **Why:** A plot summary, not a claim.
- **Ronith (pass/fail + critique):**

## Bad remarks (8)

### B1 · Restates · bad
- **Read to:** ch. 1
- **Excerpt:** Mrs. Bennet is silly.
- **Remark (The Author):** Indeed, the narrator calls her "a woman of mean understanding, little information, and uncertain temper" [p. 3].
- **Why bad:** It agrees and adds a quote, but opens nothing. The quote checks out, so citation checks pass while the remark still fails.
- **Ronith (pass/fail + critique):**

### B2 · Nit-pick · bad
- **Read to:** ch. 3
- **Excerpt:** Bingley danced with Jane three times. He's obviously smitten.
- **Remark (The Devil's Advocate):** Actually, he danced with her twice [p. 8].
- **Why bad:** A correction that changes nothing about the reading. It answers the detail, not the claim.
- **Ronith (pass/fail + critique):**

### B3 · Words in the reader's mouth · bad
- **Read to:** ch. 7
- **Excerpt:** Lydia is so loud.
- **Remark (The Devil's Advocate):** You see Lydia as the family's biggest problem, but her boldness might be the most honest thing in the house.
- **Why bad:** The notes never say "biggest problem". Inventing the reader's view is the failure D39 forbids.
- **Ronith (pass/fail + critique):**

### B4 · Spoiler · bad
- **Read to:** ch. 6
- **Excerpt:** Darcy is cold and proud.
- **Remark (The Author):** Hold that thought until his letter at Rosings. It reframes everything you've seen of him.
- **Why bad:** It reveals events past the reader's position.
- **Ronith (pass/fail + critique):**

### B5 · A lecture · bad
- **Read to:** ch. 8
- **Excerpt:** Miss Bingley is fake.
- **Remark (The Scholar):** Miss Bingley embodies the Regency marriage market's commodification of femininity, a theme critics from Gilbert and Gubar to Claudia Johnson have explored at length, situating Austen's satire within broader debates about women's economic dependence, social performance and the limits of propriety, which the novel interrogates through its contrasting heroines and their divergent fates.
- **Why bad:** Far over length, a list of names, jargon, and a hint at "divergent fates" ahead. Nothing the reader can use.
- **Ronith (pass/fail + critique):**

### B6 · Empty praise · bad
- **Excerpt:** Darcy's pride and Elizabeth's prejudice mirror each other.
- **Remark (The Author):** Great observation! You've captured the novel's central irony beautifully.
- **Why bad:** Praise only. It should have passed, or pushed further (where do the two *differ*?).
- **Ronith (pass/fail + critique):**

### B7 · Answers the reference material · bad
- **Excerpt:**
  entail — an estate settled on male heirs only
  Mr. Bennet seems strangely calm about it.
- **Remark (The Scholar):** "Entail" comes from the Old French *taillier*, to cut: the estate's line of inheritance is cut to sons.
- **Why bad:** It remarks on the definition and ignores the reader's actual claim about Mr. Bennet.
- **Ronith (pass/fail + critique):**

### B8 · Quotes another work · bad
- **Excerpt:** The Bennet girls are raised to be ornaments.
- **Remark (The Scholar):** As Wollstonecraft wrote, women are "taught from their infancy that beauty is woman's sceptre."
- **Why bad:** It quotes an outside work, which the app can't check (D39 forbids it), and the quote is the kind models misremember. `checkCitations` should drop it, and the eval should confirm that.
- **Ronith (pass/fail + critique):**
