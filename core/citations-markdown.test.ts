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

// Regression (S8.2b, live): PDF text breaks words with stray spaces ("c aprice", "uncert ain"), so a
// correctly quoted daemon nugget failed its check and was dropped. Spacing is ignored entirely.
test("a correct quote passes against PDF text with stray spaces inside words; an invented one still fails", () => {
  const book = parsePages("[PDF p. 2] Mr. Bennet was so odd a mixture of quick parts, sarcastic humour, reserve, and c aprice, that the experience");
  expect(checkCitations('He is "a mixture of quick parts, sarcastic humour, reserve, and caprice" [p. 2].', book)[0].status).toBe("ok");
  expect(checkCitations('He is "a mixture of slow parts and gentle humour" [p. 2].', book)[0].status).toBe("quote_not_on_page");
});
