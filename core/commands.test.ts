import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { checkCitations } from "./citations.ts";
import { COMMANDS, commandLabel, defineQuote, insertAfterLine, isDefinable, trimPhrase } from "./commands.ts";
import { parsePassage } from "./passage.ts";

// Word "levity" on p. 5 and on p. 50; "gravitas" only on p. 5.
const passage = [
  "[p. 5]",
  "Mr. Hale spoke with levity. He had no gravitas at all.",
  "A quiet paragraph.",
  "[p. 50]",
  "Years later the levity was gone! Only silence stayed.",
].join("\n\n");

// The /define quote for the first occurrence of `word` in `notes` (selected like a double-click).
const quoteFor = (notes: string, word: string, ref = passage) => {
  const start = notes.indexOf(word);
  return defineQuote(ref, notes, start, start + word.length);
};

test("every command row names a prompt file that exists", () => {
  for (const { promptFile } of Object.values(COMMANDS)) {
    expect(readFileSync(join(process.cwd(), "prompts", promptFile), "utf8")).toMatch(/OWNER: Ronith/);
  }
});

test("/define takes one line of at most 4 words and 40 characters", () => {
  expect(isDefinable(" melancholy ")).toBe(true);
  expect(isDefinable("one two three four")).toBe(true);
  expect(isDefinable("one two three four five")).toBe(false);
  expect(isDefinable("x".repeat(41))).toBe(false);
  expect(isDefinable("two\nlines")).toBe(false);
  expect(isDefinable("  ")).toBe(false);
});

test("chat labels: /define word, /quiz, /quiz on a truncated one-line selection", () => {
  expect(commandLabel({ name: "define", selection: " melancholy " })).toBe("/define melancholy");
  expect(commandLabel({ name: "quiz", selection: " \n" })).toBe("/quiz");
  expect(commandLabel({ name: "quiz", selection: "a\nb" })).toBe("/quiz on: “a b”");
  expect(commandLabel({ name: "quiz", selection: "x".repeat(61) })).toBe(`/quiz on: “${"x".repeat(60)}…”`);
  expect(commandLabel({ name: "quiz", selection: "x".repeat(60) })).toBe(`/quiz on: “${"x".repeat(60)}”`);
});

test("no nearby cite: the first occurrence, with its ¶ and page", () => {
  expect(quoteFor("What does levity mean here?", "levity")).toBe("> “Mr. Hale spoke with levity.” [¶1, p. 5]");
});

test("a nearby page cite picks the closest page (p. 48 → the p. 50 sentence)", () => {
  expect(quoteFor("[p. 48] the mood turns\nlevity is lost", "levity")).toBe(
    "> “Years later the levity was gone!” [¶3, p. 50]",
  );
  expect(quoteFor("p. 6: levity", "levity")).toBe("> “Mr. Hale spoke with levity.” [¶1, p. 5]");
});

test("a nearby ¶ cite picks the closest paragraph, even with a page inside its brackets", () => {
  expect(quoteFor("levity again [¶3, p. 50]", "levity")).toBe("> “Years later the levity was gone!” [¶3, p. 50]");
  expect(quoteFor("[¶2-3] levity", "levity")).toBe("> “Years later the levity was gone!” [¶3, p. 50]");
  // The nearest cite wins: [¶1] is on the selection's line, [¶3] is two lines away.
  expect(quoteFor("[¶3] later\n\n[¶1] levity", "levity")).toBe("> “Mr. Hale spoke with levity.” [¶1, p. 5]");
});

test("a cite more than 5 lines away is not nearby", () => {
  const notes = "[p. 50]\n" + "\n".repeat(6) + "levity";
  expect(quoteFor(notes, "levity")).toBe("> “Mr. Hale spoke with levity.” [¶1, p. 5]");
});

test("matching is case-insensitive, whole-word, and takes multi-word phrases", () => {
  expect(quoteFor("GRAVITAS", "GRAVITAS")).toBe("> “He had no gravitas at all.” [¶1, p. 5]");
  expect(quoteFor("no  gravitas", "no  gravitas")).toBe("> “He had no gravitas at all.” [¶1, p. 5]");
  expect(quoteFor("the levity, was", "levity,")).toBe("> “Mr. Hale spoke with levity.” [¶1, p. 5]");
  expect(quoteFor("lev", "lev")).toBeUndefined(); // part of a word is not the word
});

test("a word not in the passage, or a blank selection, gives no quote", () => {
  expect(quoteFor("hubris", "hubris")).toBeUndefined();
  expect(defineQuote(passage, "  ", 0, 2)).toBeUndefined();
});

test("no page markers: the cite has no page part; line breaks inside a sentence become spaces", () => {
  expect(quoteFor("levity", "levity", "One line\nof levity here. Next.")).toBe("> “One line of levity here.” [¶1]");
});

test("dialogue that starts and ends with a quote mark is not wrapped again; other sentences are", () => {
  const dialogue = [
    "“But, my dear, you must indeed go.” Then silence.",
    "“My dear Mr. Bennet,” said his lady, “have you heard?” He had not.",
    "\"Plain quotes, dear.\" Ok.",
    "‘Single quotes,’ he said, ‘dear’. Fine.",
    "“Yes,” he said, dear.",
  ].join("\n\n");
  const quote = (notes: string) => quoteFor(notes, "dear", dialogue);
  expect(quote("[¶1] dear")).toBe("> “But, my dear, you must indeed go.” [¶1]");
  expect(quote("[¶2] dear")).toBe("> “My dear Mr. Bennet,” said his lady, “have you heard?” [¶2]");
  expect(quote("[¶3] dear")).toBe('> "Plain quotes, dear." [¶3]');
  expect(quote("[¶4] dear")).toBe("> ‘Single quotes,’ he said, ‘dear’. [¶4]"); // a period after the closing quote
  expect(quote("[¶5] dear")).toBe("> ““Yes,” he said, dear.” [¶5]"); // starts with a quote, ends with a period
});

test("trimPhrase drops markdown and punctuation at the ends only", () => {
  expect(trimPhrase("**Netherfield**")).toBe("Netherfield");
  expect(trimPhrase(" _ennui_, ")).toBe("ennui");
  expect(trimPhrase("“Mr. Darcy’s”")).toBe("Mr. Darcy’s");
  expect(trimPhrase("**")).toBe("");
});

test("the quoted sentence is verbatim: checkCitations accepts it", () => {
  const quote = quoteFor("[p. 48] levity", "levity")!;
  const sentence = quote.match(/“(.*)”/)![1];
  const paragraphs = parsePassage(passage).map((p) => p.text);
  expect(checkCitations(`“${sentence}” [¶3]`, paragraphs)).toEqual([{ quote: sentence, cited: [3], status: "ok" }]);
});

test("insert goes on the line after the selection's last line, even when selected mid-line", () => {
  const notes = "first line\nsome levity here\nnext";
  const end = notes.indexOf("levity") + "levity".length;
  expect(insertAfterLine(notes, end, "> Q")).toEqual({
    notes: "first line\nsome levity here\n> Q\n\nnext", // blank line keeps "next" out of the blockquote
    caret: "first line\nsome levity here\n> Q".length,
  });
});

test("insert on the last line with no trailing newline appends a line", () => {
  expect(insertAfterLine("only levity", 5, "> Q")).toEqual({ notes: "only levity\n> Q", caret: 15 });
});

test("insert before a blank line adds no extra blank line; a whole-line selection inserts after that line", () => {
  expect(insertAfterLine("a levity\n\nb", 3, "> Q").notes).toBe("a levity\n> Q\n\nb");
  expect(insertAfterLine("a levity\nb", "a levity\n".length, "> Q").notes).toBe("a levity\n> Q\n\nb");
});
