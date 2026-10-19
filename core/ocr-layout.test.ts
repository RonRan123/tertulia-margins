import { expect, test } from "vitest";
import { placeWords, type OcrWord } from "./ocr-layout.ts";

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

test("placeWords skips specks, blanks and empty lines, and keeps squeezing within bounds", () => {
  const placed = placeWords(
    [{ words: [word("a", 0, 1000), word(" ", 10, 20), word("~", 30, 40, 100, 140, 5)] }, { words: [] }],
    4,
    toPdf,
    widthAt1,
  );
  expect(placed.map((w) => w.text)).toEqual(["a"]);
  expect(placed[0].squeeze).toBe(500);
  expect(placed[0].y).toBe(792 - 140 / 4); // no baseline: the words' bottom
});
