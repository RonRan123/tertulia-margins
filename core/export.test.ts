import { expect, test } from "vitest";
import { exportMarkdown, yamlString } from "./export.ts";
import { pageRange, parsePassage } from "./passage.ts";

const DAY = new Date(2026, 9, 9, 23, 30); // local time, late evening: must still be the 9th

test("frontmatter with the reference's page range, then the notes", () => {
  const reference = "[p. 101]\n\nA.\n\nB.\n\n[p. 108]\n\nC.";
  expect(exportMarkdown("My note.", reference, DAY)).toEqual({
    filename: "tertulia-notes-2026-10-09.md",
    content: "---\nexported: 2026-10-09\nreference_pages: p. 101 to p. 108\n---\n\nMy note.",
  });
});

test("no page markers (or no reference): reference_pages is omitted", () => {
  const expected = "---\nexported: 2026-10-09\n---\n\nMy note.";
  expect(exportMarkdown("My note.", "A.\n\nB.", DAY).content).toBe(expected);
  expect(exportMarkdown("My note.", "", DAY).content).toBe(expected);
});

test("page range forms match the reference button's labels", () => {
  const range = (reference: string) => pageRange(parsePassage(reference));
  expect(range("[p. 101]\n\nA.\n\nB.")).toBe("p. 101");
  expect(range("[p. xii]\n\nA.\n\n[p. xiv]\n\nB.")).toBe("p. xii to p. xiv");
  expect(range("[pp. 10-11]\nA.\n\n[p. 12] B.")).toBe("pp. 10–11 to p. 12");
  expect(range("[PDF p. 3]\n\nA.\n\n[PDF p. 4]\n\nB.")).toBe("PDF p. 3 to PDF p. 4");
  expect(range("Unlabelled.\n\n[p. 5]\n\nA.")).toBe("p. 5");
  expect(range("A.\n\nB.")).toBeUndefined();
});

test("notes are kept byte for byte: blockquotes, markdown, blank lines, trailing newlines", () => {
  const notes = "# Ch. 3\n\n> “The quote” [¶4]\n\n- a: b\n---\n  indented\r\n\n\n";
  const { content } = exportMarkdown(notes, "", DAY);
  expect(content.endsWith(`---\n\n${notes}`)).toBe(true);
  expect(content.slice(content.indexOf("---\n\n") + 5)).toBe(notes);
});

test("filename and date are the local day, zero-padded", () => {
  expect(exportMarkdown("x", "", new Date(2027, 0, 5, 0, 1)).filename).toBe("tertulia-notes-2027-01-05.md");
});

test("YAML values: page labels stay plain; anything YAML could misread is quoted", () => {
  expect(yamlString("p. 101 to p. 108")).toBe("p. 101 to p. 108");
  expect(yamlString("PDF pp. 3–4 to PDF p. xii")).toBe("PDF pp. 3–4 to PDF p. xii");
  expect(yamlString("p: 1")).toBe('"p: 1"');
  expect(yamlString('# "x"')).toBe('"# \\"x\\""');
});
