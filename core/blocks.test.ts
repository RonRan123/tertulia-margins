import { expect, test } from "vitest";
import { appendBlock, blockAt, closeBlock, commandTarget, layoutRows, removeBlock, renderMarkdown, replaceBlock, splitBlocks, stackCards } from "./blocks.ts";

const texts = (notes: string) => splitBlocks(notes).map((b) => b.text);

const SAMPLES = [
  "",
  "one",
  "one\ntwo",
  "one\n\ntwo",
  "one\n\n\n\ntwo\n\nthree",
  "one\n   \n\t\ntwo", // whitespace-only lines are blank
  "\n\n  one\n\ntwo\n\n\n", // leading and trailing blank lines
  "one\r\n\r\ntwo\r\nstill two\r\n",
  "trailing spaces  \n\n> “quote” [¶4, p. 12]",
  "```\ncode\n\nmore\n```",
  "  \n \n",
];

test("blocks are runs of non-blank lines; offsets slice back to their text", () => {
  expect(texts("one\ntwo\n\nthree")).toEqual(["one\ntwo", "three"]);
  expect(texts("one\n\n\n\ntwo")).toEqual(["one", "two"]);
  expect(texts("one\n  \n\t\ntwo")).toEqual(["one", "two"]);
  expect(texts("")).toEqual([]);
  expect(texts("  \n \n")).toEqual([]);
  for (const notes of SAMPLES) for (const b of splitBlocks(notes)) expect(notes.slice(b.start, b.end)).toBe(b.text);
});

test("leading and trailing blank lines belong to no block", () => {
  const notes = "\n\n  one\n\ntwo\n\n\n";
  expect(texts(notes)).toEqual(["  one", "two"]); // a block keeps its indentation
  expect(splitBlocks(notes)[0].start).toBe(2);
});

test("CRLF notes: blocks don't carry the \\r of their last line", () => {
  expect(texts("one\r\n\r\ntwo\r\nstill two\r\n")).toEqual(["one", "two\r\nstill two"]);
});

test("a blank line inside a ``` fence splits it (accepted cost, D20)", () => {
  expect(texts("```\ncode\n\nmore\n```")).toEqual(["```\ncode", "more\n```"]);
});

test("replacing a block with its own text leaves the notes byte-identical", () => {
  for (const notes of SAMPLES) for (const b of splitBlocks(notes)) expect(replaceBlock(notes, b, b.text)).toBe(notes);
});

test("replacing a block changes only its slice; separators are kept as written", () => {
  const notes = "one\n\n\n  \ntwo\n\nthree\n";
  const [, two] = splitBlocks(notes);
  expect(replaceBlock(notes, two, "TWO\nlines")).toBe("one\n\n\n  \nTWO\nlines\n\nthree\n");
  const typedBlankLine = replaceBlock(notes, two, "two\n\nsplit");
  expect(texts(typedBlankLine)).toEqual(["one", "two", "split", "three"]); // splits on the next derive
});

test("appendBlock adds a blank line only when one is missing", () => {
  expect(appendBlock("", "new")).toBe("new");
  expect(appendBlock("one", "new")).toBe("one\n\nnew");
  expect(appendBlock("one\n", "new")).toBe("one\n\nnew");
  expect(appendBlock("one\n\n", "new")).toBe("one\n\nnew");
  expect(appendBlock("one\n \n", "new")).toBe("one\n \nnew");
  expect(appendBlock("one\r\n", "new")).toBe("one\r\n\r\nnew");
  expect(texts(appendBlock("one", "new"))).toEqual(["one", "new"]);
});

test("removeBlock drops the block and one adjacent separator", () => {
  const notes = "one\n\n\ntwo\n\nthree\n\n";
  const [one, two, three] = splitBlocks(notes);
  expect(removeBlock(notes, one)).toBe("two\n\nthree\n\n");
  expect(removeBlock(notes, two)).toBe("one\n\n\nthree\n\n");
  expect(removeBlock(notes, three)).toBe("one\n\n\ntwo\n\n"); // last block: the separator before it goes
  expect(removeBlock("\n only \n", splitBlocks("\n only \n")[0])).toBe("\n\n");
});

test("blockAt finds the block under a caret, or nothing on a separator", () => {
  const notes = "one\n\ntwo";
  const blocks = splitBlocks(notes);
  expect(blockAt(blocks, 0)?.text).toBe("one");
  expect(blockAt(blocks, 3)?.text).toBe("one"); // at the end of the block
  expect(blockAt(blocks, 4)).toBeUndefined(); // on the blank line
  expect(blockAt(blocks, notes.length)?.text).toBe("two");
});

test("a command targets the trimmed selection, else the whole block under the caret", () => {
  const notes = "First idea.\n\nSecond line one\nsecond line two.\n\n\nThird.";
  const at = (text: string) => notes.indexOf(text);
  expect(commandTarget(notes, at("Second") - 2, at("one") + 3)).toBe("Second line one");
  expect(commandTarget(notes, at("\n\nSecond"), at("Second"))).toBeUndefined(); // only whitespace selected
  const caret = (n: number) => commandTarget(notes, n, n);
  expect(caret(at("line two"))).toBe("Second line one\nsecond line two.");
  expect(caret(at("Second"))).toBe("Second line one\nsecond line two."); // at a block's start
  expect(caret(at("two.") + 4)).toBe("Second line one\nsecond line two."); // at its end
  expect(caret(0)).toBe("First idea.");
  expect(caret(notes.length)).toBe("Third.");
  expect(caret(at("Third") - 1)).toBeUndefined(); // on a blank line
  expect(commandTarget("", 0, 0)).toBeUndefined();
  expect(commandTarget("A.\n   \nB.", 8, 8)).toBe("B."); // a spaces-only line still separates
});

test("closeBlock removes a block left empty or blank, and keeps any other", () => {
  const notes = "one\n\n\n\ntwo";
  expect(closeBlock(notes, { start: 5, end: 5 })).toBe("one\n\ntwo"); // emptied middle block
  expect(closeBlock("one\n\n  ", { start: 5, end: 7 })).toBe("one"); // blank last block
  expect(closeBlock(notes, { start: 0, end: 3 })).toBe(notes);
  expect(closeBlock("", { start: 0, end: 0 })).toBe("");
});

const rowTexts = (rows: { text: string; isEditing: boolean }[]) => rows.map((r) => (r.isEditing ? `[${r.text}]` : r.text));

test("layoutRows: one row per block; the block being edited stays one row", () => {
  const notes = "one\n\ntwo\n\nsplit\n\nthree";
  expect(rowTexts(layoutRows(notes, []).rows)).toEqual(["one", "two", "split", "three"]);
  const editing = { start: notes.indexOf("two"), end: notes.indexOf("split") + 5 }; // a blank line typed while editing
  expect(rowTexts(layoutRows(notes, [], editing).rows)).toEqual(["one", "[two\n\nsplit]", "three"]);
});

test("layoutRows: an empty block being edited still gets its row, in place", () => {
  const notes = "one\n\n\n\ntwo";
  expect(rowTexts(layoutRows(notes, [], { start: 5, end: 5 }).rows)).toEqual(["one", "[]", "two"]);
  expect(rowTexts(layoutRows(notes, [], { start: notes.length, end: notes.length }).rows)).toEqual(["one", "two", "[]"]);
  expect(rowTexts(layoutRows("", [], { start: 0, end: 0 }).rows)).toEqual(["[]"]);
});

test("layoutRows: reactions sit beside the row where their excerpt starts; detached go last", () => {
  const notes = "First idea.\n\nSecond line one\nsecond line two.\n\nThird.";
  const reactions = [
    { id: "a", excerpt: "Third." },
    { id: "b", excerpt: "line two" },
    { id: "c", excerpt: "Second line one second line two." }, // rewrapped: still found
    { id: "d", excerpt: "idea.\n\nSecond" }, // spans blocks: where it starts
    { id: "e", excerpt: "rewritten away" },
  ];
  const { rows, detached } = layoutRows(notes, reactions);
  expect(rows.map((r) => r.reactions.map((p) => p.reaction.id))).toEqual([["d"], ["c", "b"], ["a"]]);
  expect(rows[2].reactions[0]).toMatchObject({ start: notes.indexOf("Third."), end: notes.length });
  expect(detached.map((r) => r.id)).toEqual(["e"]);
  const editing = { start: notes.indexOf("Second"), end: notes.length }; // one edit row over two blocks
  expect(layoutRows(notes, reactions, editing).rows.map((r) => r.reactions.length)).toEqual([1, 3]);
});

test("renderMarkdown: headings, emphasis, lists, blockquote, table, code, line breaks", () => {
  expect(renderMarkdown("# Title")).toBe("<h1>Title</h1>\n");
  expect(renderMarkdown("*em* **strong** ~~gone~~")).toBe("<p><em>em</em> <strong>strong</strong> <del>gone</del></p>\n");
  expect(renderMarkdown("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n");
  expect(renderMarkdown("1. a\n2. b")).toContain("<ol>");
  expect(renderMarkdown("line one\nline two")).toBe("<p>line one<br>line two</p>\n");
  expect(renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |")).toContain("<td>1</td>");
  expect(renderMarkdown("```\nx < y\n```")).toBe("<pre><code>x &lt; y\n</code></pre>\n");
  expect(renderMarkdown("[link](https://example.com)")).toBe(
    '<p><a target="_blank" rel="noopener noreferrer" href="https://example.com">link</a></p>\n',
  );
  expect(renderMarkdown("see https://example.com")).toContain('<a target="_blank" rel="noopener noreferrer" href="https://example.com">');
  expect(renderMarkdown("`<a href=x>`")).toBe("<p><code>&lt;a href=x&gt;</code></p>\n"); // code stays escaped, untouched
});

test("a passage quote renders as a blockquote with its cite", () => {
  expect(renderMarkdown("> “It is a truth.” [¶4, p. 12]")).toBe(
    '<blockquote>\n<p>“It is a truth.” <span class="cite">[¶4, p. 12]</span></p>\n</blockquote>\n',
  );
});

test("raw HTML is escaped, never rendered", () => {
  expect(renderMarkdown("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n");
  expect(renderMarkdown("hi <mark>x</mark>")).toBe("<p>hi &lt;mark&gt;x&lt;/mark&gt;</p>\n");
  expect(renderMarkdown('<img src=x onerror="alert(1)">')).not.toContain("<img");
});

test("javascript: and other unsafe links lose the link but keep their text", () => {
  for (const href of ["javascript:alert(1)", "JavaScript:alert(1)", "javascript&#58;alert(1)", "javascript&#x3A;alert(1)", "data:text/html,x", "vbscript:x"]) {
    expect(renderMarkdown(`[x](${href})`)).toBe("<p>x</p>\n");
  }
  expect(renderMarkdown("<javascript:alert(1)>")).not.toContain("href");
  expect(renderMarkdown("![pic](javascript:alert(1))")).toBe("<p>pic</p>\n");
  for (const href of ["mailto:a@b.c", "#top", "/notes", "../x.md", "http://example.com"]) {
    expect(renderMarkdown(`[x](${href})`)).toContain(`href="${href}"`);
  }
});

test("cites are wrapped in text, but not inside code", () => {
  const cite = (c: string) => `<span class="cite">${c}</span>`;
  expect(renderMarkdown("See [¶4] and [¶3-4], [¶12 · p. 101].")).toBe(
    `<p>See ${cite("[¶4]")} and ${cite("[¶3-4]")}, ${cite("[¶12 · p. 101]")}.</p>\n`,
  );
  expect(renderMarkdown("*so [¶5]*")).toBe(`<p><em>so ${cite("[¶5]")}</em></p>\n`);
  expect(renderMarkdown("`[¶6]`")).toBe("<p><code>[¶6]</code></p>\n");
  expect(renderMarkdown("```\n[¶7]\n```")).toBe("<pre><code>[¶7]\n</code></pre>\n");
  expect(renderMarkdown("[plain] and [¶] alone")).toBe("<p>[plain] and [¶] alone</p>\n");
  expect(renderMarkdown('<a title="[¶8]">')).toBe("<p>&lt;a title=&quot;[¶8]&quot;&gt;</p>\n"); // escaped, not wrapped
});

test("margin stacks start at their block's top; one that would overlap is pushed below the one before", () => {
  expect(stackCards([], 12)).toEqual([]);
  // Room between blocks: each stack sits at its anchor.
  expect(stackCards([{ anchor: 0, height: 50 }, { anchor: 100, height: 30 }], 12)).toEqual([0, 100]);
  // A tall stack pushes the next ones down, and the push carries on down the margin.
  expect(stackCards([{ anchor: 0, height: 200 }, { anchor: 40, height: 30 }, { anchor: 80, height: 30 }], 12)).toEqual([0, 212, 254]);
  // Once there is room again, a stack returns to its anchor.
  expect(stackCards([{ anchor: 0, height: 20 }, { anchor: 10, height: 20 }, { anchor: 500, height: 20 }], 12)).toEqual([0, 32, 500]);
});
