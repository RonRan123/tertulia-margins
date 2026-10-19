import { expect, test } from "vitest";
import { placeWords, repairWords, type OcrLine, type OcrWord } from "./ocr-layout.ts";

const word = (text: string, x0: number, x1: number, y0 = 100, y1 = 140, confidence = 90): OcrWord => ({ text, confidence, x0, y0, x1, y1 });
// 4 image pixels per point on a 792 pt tall page: pixel (x, y) → point (x / 4, 792 − y / 4).
const toPdf = (x: number, y: number) => [x / 4, 792 - y / 4];
const widthAt1 = (text: string) => 0.5 * text.length; // every glyph half an em wide

test("placeWords puts each word at its spot on the line's baseline, sized to the line", () => {
  const placed = placeWords([{ words: [word("Every", 400, 600), word("state", 640, 840, 104, 140)], baseline: { y0: 132, y1: 136 } }], 4, toPdf, widthAt1);
  expect(placed.map((w) => [w.text, w.x, w.y, w.size])).toEqual([
    ["Every", 100, 792 - 134 / 4, 10],
    ["state", 160, 792 - 134 / 4, 10],
  ]);
  // "Every" covers 200 px = 50 pt; at size 10 the font draws it 25 pt wide, so it's stretched to 200%.
  expect(placed[0].squeeze).toBe(200);
});

test("placeWords keeps doubtful words, skips blanks and empty lines, and keeps squeezing within bounds", () => {
  const placed = placeWords(
    [{ words: [word("a", 0, 1000), word(" ", 10, 20), word("~", 30, 40, 100, 140, 5)] }, { words: [] }],
    4,
    toPdf,
    widthAt1,
  );
  expect(placed.map((w) => w.text)).toEqual(["a", "~"]);
  expect(placed[0].squeeze).toBe(500);
  expect(placed[0].y).toBe(792 - 140 / 4); // no baseline: the words' bottom
});

// D56: doubtful words repaired from the document's own confident words.
const line = (...words: [string, number][]): OcrLine => ({ words: words.map(([text, confidence], i) => word(text, i * 100, i * 100 + 80, 100, 140, confidence)) });

test("repairWords undoes a common misread when the document knows the result", () => {
  const pages = [
    [line(["if", 95], ["we", 96], ["can", 96]), line(["If", 90], ["so,", 95], ["F.", 92], ["F.", 89])], // "F. A. Hayek" twice
    [line(["information,", 96], ["¢f", 38], ["we", 96]), line(["(¢f)", 30], ["modern", 40], ["rnodern", 45])],
  ];
  const { pages: fixed, stats } = repairWords(pages);
  expect(fixed[1][0].words.map((w) => w.text)).toEqual(["information,", "if", "we"]);
  expect(fixed[1][1].words.map((w) => w.text)).toEqual(["(if)", "modern", "rnodern"]); // punctuation kept; "modern" isn't known twice
  expect(stats).toEqual({ words: 13, fixed: 2, uncertain: 2 });
});

test("repairWords leaves confident words and doubtful words the document knows alone", () => {
  const pages = [[line(["rn", 99], ["m", 99], ["m", 99]), line(["if", 38], ["if", 90], ["if", 90], ["HAvex*", 48])]];
  const { pages: fixed, stats } = repairWords(pages);
  expect(fixed[0].flatMap((l) => l.words.map((w) => w.text))).toEqual(["rn", "m", "m", "if", "if", "if", "HAvex*"]);
  expect(stats).toEqual({ words: 7, fixed: 0, uncertain: 1 });
});
