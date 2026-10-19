import { expect, test } from "vitest";
import { afterPromote, afterRun, freshDaemonState, isSameRemark, ownLines, planDaemons, sentenceAround, type DaemonCard } from "./daemons.ts";

// The reader's own lines (D37): short and distinct, so each counts as one line.
const WORDS = ["pride", "prejudice", "marriage", "fortune", "irony", "manners", "letters", "estate", "sisters", "mother", "father", "ball", "rain", "walk", "proposal", "regiment"];
const mine = (n: number, topic = "thought") => {
  const seed = [...topic].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const word = (k: number) => WORDS[(seed + k) % WORDS.length];
  return Array.from({ length: n }, (_, i) => `${topic} ${i + 1}: the ${word(i)} and ${word(i * 5 + 7)} with ${word(i * 3 + 11)} matter here`).join("\n");
};
let ids = 0;
const newId = () => `card-${++ids}`;
const nugget = (daemon: "author" | "devils-advocate", anchor: string) => ({ daemon, text: `${daemon} says something`, anchor });

test("own lines: about 12 words a line; headings, blockquotes, bare page refs and quoted lines don't count", () => {
  expect(ownLines("A thought of mine.")).toBe(1);
  expect(ownLines(Array(30).fill("word").join(" "))).toBe(3); // a long unwrapped line: ~12 words a line
  expect(ownLines("# Chapter 3\n> It is a truth universally acknowledged [p. 1]\n[p. 4]\np. 12–13\n“It is a truth universally acknowledged,” she said.")).toBe(0);
  expect(ownLines("She calls it “a truth” but I doubt the whole neighbourhood agrees.")).toBe(1);
});

test("a book's existing notes count as seen: daemons never sweep the backlog", () => {
  const notes = mine(30);
  expect(planDaemons(notes, freshDaemonState(notes))).toMatchObject({ kind: "wait" });
});

test("ten new lines of the reader's own words start a run on the paragraphs that hold them, and (D51) on those whose lines no card answers", () => {
  const old = mine(5, "old");
  const state = freshDaemonState(old);
  expect(planDaemons(`${old}\n\n${mine(9)}`, state)).toMatchObject({ kind: "wait" }); // sparse paragraphs never start a run
  const plan = planDaemons(`${old}\n\n${mine(10)}`, state);
  expect(plan).toEqual({ kind: "run", excerpt: `${old}\n\n${mine(10)}`, paragraphs: [old, mine(10)], lines: 10, mustPick: false });
  const answered = { ...state, cards: [{ id: "c", daemon: "author" as const, text: "Hm?", anchor: old }] };
  expect(planDaemons(`${old}\n\n${mine(10)}`, answered)).toMatchObject({ excerpt: mine(10), paragraphs: [mine(10)] });
});

test("adding to a paragraph counts only the new lines; a touched-up line counts as seen", () => {
  const first = mine(6);
  const state = freshDaemonState(first);
  const lines = first.split("\n");
  const touchedUp = [lines[0] + "!", lines[1].replace("matter", "mater"), ...lines.slice(2)].join("\n");
  const grown = `${touchedUp}\n${mine(4, "later")}`;
  expect(planDaemons(grown, state)).toMatchObject({ kind: "wait" }); // 4 new lines, not 10
  expect(planDaemons(`${grown}\n${mine(6, "added")}`, state)).toMatchObject({ kind: "run", lines: 10 });
});

test("quotes copied from the book don't wake the daemons", () => {
  const quotes = Array.from({ length: 12 }, (_, i) => `> “It is a truth universally acknowledged,” line ${i} [p. 1]`).join("\n");
  expect(planDaemons(quotes, freshDaemonState(""))).toMatchObject({ kind: "wait" });
});

test("after a run: its lines are seen; the pick becomes a card, the rest join the pool; no pick adds to the count", () => {
  const notes = mine(10);
  const plan = planDaemons(notes, freshDaemonState(""));
  if (plan.kind !== "run") throw new Error("expected a run");

  const picked = afterRun(freshDaemonState(""), plan, [0], [nugget("author", "thought 1"), nugget("devils-advocate", "thought 2")], newId);
  expect(picked.cards.map((c) => c.daemon)).toEqual(["author"]);
  expect(picked.pool.map((c) => c.daemon)).toEqual(["devils-advocate"]);
  expect(picked.linesSinceCard).toBe(0);
  expect(planDaemons(notes, picked)).toMatchObject({ kind: "wait" });

  const empty = afterRun(freshDaemonState(""), plan, [], [], newId);
  expect(empty).toMatchObject({ cards: [], pool: [], linesSinceCard: 10 });
});

test("the floor: a runner-up still in the notes is shown for free; otherwise the next run must pick", () => {
  const notes = mine(10);
  const runnerUp: DaemonCard = { id: "r1", ...nugget("devils-advocate", "thought 3") };
  const quiet = { ...freshDaemonState(notes), linesSinceCard: 12, pool: [runnerUp] };
  const withMore = `${notes}\n\n${mine(3, "new")}`;
  expect(planDaemons(withMore, quiet)).toEqual({ kind: "promote", card: runnerUp });
  expect(afterPromote(quiet, runnerUp)).toMatchObject({ cards: [runnerUp], pool: [], linesSinceCard: 0 });

  const gone = { ...quiet, pool: [{ ...runnerUp, anchor: "words no longer in the notes" }] };
  expect(planDaemons(withMore, gone)).toMatchObject({ kind: "wait" }); // floor due, but under 10 new lines
  expect(planDaemons(`${notes}\n\n${mine(10, "new")}`, gone)).toMatchObject({ kind: "run", mustPick: true });
});

test("the reader asks: a run now, on all the notes, that must pick", () => {
  const notes = `${mine(4, "old")}\n\n${mine(12, "later")}`;
  const state = freshDaemonState(notes);
  expect(planDaemons(notes, state)).toEqual({ kind: "wait", lines: 0 });
  // Nothing new: still every paragraph.
  expect(planDaemons(notes, state, true)).toEqual({ kind: "run", excerpt: notes, paragraphs: [mine(4, "old"), mine(12, "later")], lines: 0, mustPick: true });
  // Three new lines, under the automatic threshold: every paragraph, the new lines counted.
  const more = `${notes}\n\n${mine(3, "new")}`;
  expect(planDaemons(more, state)).toEqual({ kind: "wait", lines: 3 });
  expect(planDaemons(more, state, true)).toMatchObject({ kind: "run", excerpt: more, lines: 3, mustPick: true });
  // No words of the reader's own (empty, or only a copied quote): nothing to react to.
  expect(planDaemons("", freshDaemonState(""), true)).toEqual({ kind: "wait", lines: 0 });
  expect(planDaemons("> “A quote from the book, copied.”", freshDaemonState(""), true)).toEqual({ kind: "wait", lines: 0 });
});

test("isSameRemark (D51): the same point reworded is a repeat; a different point on the same page isn't", () => {
  const first = "You contrast politics with corporate hierarchy, but I compare them myself later: shareholders are as little influential in management as a 'people' ruled by expert officials [p. 15]. Is political independence then partly an illusion?";
  const again = "You contrast politics with corporate hierarchy, yet I make the same comparison later: shareholders are \"just as little influential in the business management as is a 'people' ruled by expert officials\" [p. 15]. Does that blur your independence line?";
  const other = "Weber says the state claims a monopoly of legitimate force within a territory [p. 15]. Is force the end, or only the means?";
  expect(isSameRemark(first, again)).toBe(true);
  expect(isSameRemark(first, other)).toBe(false);
  expect(isSameRemark("", first)).toBe(false);
});

test("sentenceAround (D51): an anchor widens to its whole sentence, without the list marker; unknown anchors stay as given", () => {
  const notes = '- Insight: I never made the connection. Politics requires an element of "independence" for it to work. This is a contrast with corporate life (e.g, even the CEO reports to a board).\n- Next line.';
  expect(sentenceAround(notes, "an element of")).toBe('Politics requires an element of "independence" for it to work.');
  expect(sentenceAround(notes, "Insight")).toBe("Insight: I never made the connection.");
  expect(sentenceAround(notes, "even the CEO reports")).toBe("This is a contrast with corporate life (e.g, even the CEO reports to a board).");
  expect(sentenceAround(notes, "Next")).toBe("Next line.");
  expect(sentenceAround(notes, "not there")).toBe("not there");
});
