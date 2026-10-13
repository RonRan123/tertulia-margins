// Sprint 2 test pass: regressions seen in live replies.
import { expect, test } from "vitest";
import { checkCitations } from "./citations.ts";
import { parsePages } from "./passage.ts";

// Regression (citations.ts normalize): the source marks italics with _underscores_ (Gutenberg) but
// the model renders them as Markdown *asterisks*, so a verbatim quote was flagged. Seen live on
// the Pride and Prejudice sample, ¶19 and ¶25.
test("a quote with *asterisk* italics matches _underscore_ italics in the source", () => {
  const book = parsePages("[p. 1] It is very likely that he _may_ fall in love with one of them.");
  const reply = 'She says "it is very likely that he *may* fall in love with one of them" [p. 1].';
  expect(checkCitations(reply, book)[0].status).toBe("ok");
});

test("**bold** markdown in a quote is ignored too", () => {
  const book = parsePages("[p. 1] It is very likely that he may fall in love with one of them.");
  const reply = 'She says "it is very likely that he **may** fall in love" [p. 1].';
  expect(checkCitations(reply, book)[0].status).toBe("ok");
});
