import { expect, test } from "vitest";
import { diffLines, parseTraceBatch, quizEvents, renderTrace, type TraceEvent } from "./trace.ts";

test("diffLines: added and removed lines, blank lines ignored, an edited line is one of each", () => {
  expect(diffLines("a\nb\n\nc", "a\nb2\n\nc\nd")).toEqual({ added: ["b2", "d"], removed: ["b"] });
  expect(diffLines("x\nx", "x")).toEqual({ added: [], removed: ["x"] });
  expect(diffLines("", "")).toEqual({ added: [], removed: [] });
});

test("parseTraceBatch: ids, a known kind and a time on every event, size caps", () => {
  const event = { at: "2026-10-17T13:00:00.000Z", kind: "view", view: "notes" };
  const ok = { browser: "browser-1234", session: "session-1234", events: [event] };
  expect(parseTraceBatch(ok)).toEqual(ok);
  expect(parseTraceBatch({ ...ok, browser: "../x" })).toBeUndefined();
  expect(parseTraceBatch({ ...ok, events: [] })).toBeUndefined();
  expect(parseTraceBatch({ ...ok, events: [{ ...event, kind: "nope" }] })).toBeUndefined();
  expect(parseTraceBatch({ ...ok, events: [{ kind: "view" }] })).toBeUndefined();
  expect(parseTraceBatch({ ...ok, events: Array(201).fill(event) })).toBeUndefined();
  expect(parseTraceBatch("x")).toBeUndefined();
});

test("renderTrace: a readable timeline of the reader and each agent, grouped by book", () => {
  const events: TraceEvent[] = [
    { at: "2026-10-17T13:00:05.000Z", book: "Persuasion", kind: "notes", added: ["Anne is patient."], removed: [], lines: 4 },
    { at: "2026-10-17T13:00:00.000Z", kind: "session", view: "notes+margin", books: ["Persuasion"] },
    {
      at: "2026-10-17T13:01:00.000Z", book: "Persuasion", kind: "daemons", trigger: "pause", excerpt: "Anne is patient.", mustPick: false, picks: ["author"], ms: 6200,
      drafts: [
        { daemon: "author", outcome: "picked", text: "Patient, or resigned? [p. 3]", anchor: "Anne is patient", anchorFound: true },
        { daemon: "devils-advocate", outcome: "passed", text: "", anchor: "", anchorFound: false },
        { daemon: "scholar", outcome: "dropped", reason: "quote_not_in_text", text: "As Wollstonecraft wrote, “a b c”", anchor: "x", anchorFound: false },
      ],
      tokens: { input: 12000, output: 300 },
    },
    { at: "2026-10-17T13:02:00.000Z", book: "Persuasion", kind: "card", action: "dismiss", daemon: "author", text: "Patient, or resigned? [p. 3]" },
  ];
  const md = renderTrace({ browser: "browser-1234", session: "session-1234" }, events);
  expect(md).toContain("# Session session- · browser browser-");
  expect(md.indexOf("App** opened")).toBeLessThan(md.indexOf("## In \"Persuasion\""));
  expect(md).toContain("**13:00:05 · Reader** edited the notes (+1 / −0 lines, 4 lines in all)\n  + Anne is patient.");
  expect(md).toContain("**13:01:00 · Daemons** ran after the reader paused: The Author shown, 6.2 s");
  expect(md).toContain("The Devil's Advocate: passed");
  expect(md).toContain("→ DROPPED (quote_not_in_text)");
  expect(md).toContain("not in the excerpt, fell back to its first line");
  expect(md).toContain("Tokens: panel 12000 in / 300 out");
  expect(md).toContain("**13:02:00 · Reader** dismissed The Author's card");
  const section = renderTrace({ browser: "browser-1234", session: "session-1234" }, [{ ...events[2], trigger: "asked", section: "2 of 4" } as TraceEvent]);
  expect(section).toContain("ran after the reader pressed React to notes (section 2 of 4)"); // D53
});

test("quizEvents: an answer to a choice question, then finishing; free responses and setup are left to their own events", () => {
  const question = { topic: "book-concepts" as const, kind: "multiple-choice" as const, question: "Why?", choices: [{ text: "A", why: "" }, { text: "B", why: "" }], answer: 1 };
  const free = { topic: "book-concepts" as const, kind: "free-response" as const, question: "Explain.", modelAnswer: "", keyPoints: [] };
  const setup = { topics: ["book-concepts" as const], count: 2, difficulty: "easy" as const, styles: ["multiple-choice" as const] };
  const questions = [question, free];
  const taking = { stage: "taking" as const, setup, questions, answers: [null, null], current: 0 };
  const answered = { ...taking, answers: [0, null] };
  expect(quizEvents(taking, answered)).toEqual([{ kind: "quiz", action: "answer", question: "Why?", answer: "A", isRight: false }]);
  const review = { stage: "review" as const, setup, questions, answers: [0, { text: "Because", verdict: "right" as const }] };
  expect(quizEvents(answered, review)).toEqual([{ kind: "quiz", action: "end", score: "1 of 2 right" }]);
  expect(quizEvents({ stage: "setup", setup }, taking)).toEqual([]);
});
