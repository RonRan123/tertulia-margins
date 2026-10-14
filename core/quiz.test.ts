import { expect, test } from "vitest";
import { checkQuestions, defaultSetup, freshQuiz, isQuizSetup, pickQuiz, quizBlocker, quizScore, quizStep, shuffleChoices, type QuizQuestion, type QuizSetup, type QuizState } from "./quiz.ts";

const pages = [{ page: "1", text: "The sky fell on Tuesday." }, { page: "2", text: "Nobody minded the sky." }];
const setup: QuizSetup = { topics: ["book-concepts"], count: 2, difficulty: "medium", style: "multiple-choice" };
// A well-formed multiple-choice draft: five choices of similar length, the first one right.
const mc = (question = "When did the sky fall?", over: Partial<{ topic: string; kind: string; choices: unknown[] }> = {}) => ({
  topic: "book-concepts",
  kind: "multiple-choice",
  question,
  choices: ["On Tuesday", "On Monday", "On Friday", "On Sunday", "At night"].map((text, i) => ({ text, correct: i === 0, why: `Because of ${text} [p. 1].` })),
  ...over,
});
const tf = (statement: string, isTrue: boolean) => ({
  topic: "book-concepts",
  kind: "true-false",
  question: statement,
  choices: [{ text: "True", correct: isTrue, why: "w" }, { text: "False", correct: !isTrue, why: "w" }],
});

test("setup validation: topics, 1–10 questions, difficulty, style", () => {
  expect(isQuizSetup(defaultSetup)).toBe(true);
  expect(isQuizSetup({ ...setup, topics: [] })).toBe(false);
  expect(isQuizSetup({ ...setup, topics: ["gossip"] })).toBe(false);
  expect(isQuizSetup({ ...setup, count: 0 })).toBe(false);
  expect(isQuizSetup({ ...setup, count: 11 })).toBe(false);
  expect(isQuizSetup({ ...setup, count: 2.5 })).toBe(false);
  expect(isQuizSetup({ ...setup, difficulty: "brutal" })).toBe(false);
  expect(isQuizSetup({ ...setup, style: "essay" })).toBe(false);
});

test("what the app says without asking the agent", () => {
  expect(quizBlocker({ ...setup, topics: [] }, "")).toBe("Choose at least one topic.");
  expect(quizBlocker(setup, "", "Add reference text first.")).toBe("Add reference text first.");
  expect(quizBlocker({ ...setup, topics: ["notes-terms"] }, "> “A copied quote from the book.”")).toMatch(/^Your notes have nothing of your own/);
  expect(quizBlocker({ ...setup, topics: ["notes-terms"] }, "irony — saying the opposite of what you mean")).toBeUndefined();
  expect(quizBlocker(setup, "")).toBeUndefined(); // book topics don't need notes
});

test("checks: a good question passes, with its right answer's index", () => {
  const { questions, rejected } = checkQuestions({ questions: [mc(), tf("The sky fell on Tuesday.", true)] }, { ...setup, style: "mixed" }, pages, "");
  expect(rejected).toEqual([]);
  expect(questions[0]).toMatchObject({ topic: "book-concepts", kind: "multiple-choice", question: "When did the sky fall?", answer: 0 });
  expect(questions[0].choices[0]).toEqual({ text: "On Tuesday", why: "Because of On Tuesday [p. 1]." });
  expect(questions[1]).toMatchObject({ kind: "true-false", answer: 0 });
});

test("checks: each way a question fails, with a reason", () => {
  const five = mc().choices as { text: string; correct: boolean; why: string }[];
  const cases: [unknown, RegExp][] = [
    [mc("Q", { topic: "notes-terms" }), /not one of the chosen topics/],
    [tf("The sky fell.", true), /not the chosen style/],
    [mc("Q", { choices: five.slice(0, 4) }), /exactly 5 choices/],
    [mc("Q", { choices: five.map((c) => ({ ...c, correct: true })) }), /exactly one right answer/],
    [mc("Q", { choices: five.map((c, i) => (i === 4 ? { ...c, text: "on tuesday" } : c)) }), /two choices are the same/],
    [mc("Q", { choices: five.map((c, i) => (i === 4 ? { ...c, text: "All of the above" } : c)) }), /all\/none-of-the-above/],
    [mc("Q", { choices: five.map((c, i) => (i === 0 ? { ...c, text: "On Tuesday, after the long and ominous storm" } : c)) }), /gives it away/],
    [mc("Q", { choices: five.map((c, i) => (i === 0 ? { ...c, why: "It says “fell on a Monday” [p. 1]." } : c)) }), /aren't in the book/],
    [mc("Q", { choices: five.map((c, i) => (i === 0 ? { ...c, why: " " } : c)) }), /missing its text or explanation/],
    [{ topic: "book-concepts" }, /incomplete/],
  ];
  for (const [draft, reason] of cases) {
    const { questions, rejected } = checkQuestions({ questions: [draft] }, setup, pages, "");
    expect(questions).toEqual([]);
    expect(rejected[0].reason).toMatch(reason);
  }
  const wrongTf = { ...tf("x", true), choices: [{ text: "Yes", correct: true, why: "w" }, { text: "No", correct: false, why: "w" }] };
  expect(checkQuestions({ questions: [wrongTf] }, { ...setup, style: "true-false" }, pages, "").rejected[0].reason).toMatch(/True and False/);
  // A quote from the reader's notes is fine (a notes topic).
  const notesQuote = mc("Q", { choices: five.map((c, i) => (i === 0 ? { ...c, why: "You wrote “everyone panicked on the day”." } : c)) });
  expect(checkQuestions({ questions: [notesQuote] }, setup, pages, "Everyone panicked on the day.").questions).toHaveLength(1);
});

test("shuffling moves the right answer with its choice; true/false keeps True first", () => {
  const [question] = checkQuestions({ questions: [mc()] }, setup, pages, "").questions;
  const reversed = shuffleChoices(question, () => 0); // every swap with index 0
  expect(reversed.choices.map((c) => c.text)).not.toEqual(question.choices.map((c) => c.text));
  expect(reversed.choices[reversed.answer].text).toBe("On Tuesday");
  const [statement] = checkQuestions({ questions: [{ ...tf("x", false), choices: [{ text: "False", correct: true, why: "w" }, { text: "True", correct: false, why: "w" }] }] }, { ...setup, style: "true-false" }, pages, "").questions;
  const ordered = shuffleChoices(statement);
  expect(ordered.choices.map((c) => c.text)).toEqual(["True", "False"]);
  expect(ordered.answer).toBe(1);
});

const q = (answer: number): QuizQuestion => ({ topic: "book-concepts", kind: "true-false", question: "S?", choices: [{ text: "True", why: "a" }, { text: "False", why: "b" }], answer });

test("a quiz from start to review; actions out of turn change nothing", () => {
  let state: QuizState = freshQuiz();
  state = quizStep(state, { type: "setup", setup: { ...setup, count: 2 } });
  state = quizStep(state, { type: "refused", feedback: "Not enough." });
  expect(state).toEqual({ stage: "setup", setup: { ...setup, count: 2 }, feedback: "Not enough." });
  expect(quizStep(state, { type: "started", questions: [] })).toBe(state); // nothing to ask
  state = quizStep(state, { type: "started", questions: [q(0), q(1)] });
  expect(state).toMatchObject({ stage: "taking", current: 0, answers: [null, null] });
  expect(state).not.toHaveProperty("feedback");
  expect(quizStep(state, { type: "next" })).toBe(state); // not answered yet
  expect(quizStep(state, { type: "answer", choice: 5 })).toBe(state); // no such choice
  state = quizStep(state, { type: "answer", choice: 0 });
  expect(quizStep(state, { type: "answer", choice: 1 })).toBe(state); // answered once only
  state = quizStep(state, { type: "next" });
  expect(state).toMatchObject({ stage: "taking", current: 1 });
  state = quizStep(state, { type: "answer", choice: 0 });
  state = quizStep(state, { type: "next" }); // the last question → review
  expect(state).toMatchObject({ stage: "review", answers: [0, 0] });
  if (state.stage === "review") expect(quizScore(state.questions, state.answers)).toBe(1);
  expect(quizStep(state, { type: "answer", choice: 1 })).toBe(state);
  expect(quizStep(state, { type: "new" })).toEqual({ stage: "setup", setup: { ...setup, count: 2 } });
});

test("a short quiz says so; ending early reviews what's answered", () => {
  let state = quizStep({ stage: "setup", setup: { ...setup, count: 3 } }, { type: "started", questions: [q(0), q(1)] });
  expect(state).toMatchObject({ note: "2 of the 3 questions passed our checks, so this quiz is shorter." });
  state = quizStep(state, { type: "finish" });
  expect(state).toMatchObject({ stage: "review", answers: [null, null], note: expect.any(String) });
});

test("a saved quiz loads back; a malformed one doesn't", () => {
  const taking = quizStep({ stage: "setup", setup }, { type: "started", questions: [q(0), q(1)] });
  const roundTrip = (s: unknown) => pickQuiz(JSON.parse(JSON.stringify(s)));
  expect(roundTrip(taking)).toEqual(taking);
  expect(roundTrip(quizStep(taking, { type: "finish" }))).toEqual(quizStep(taking, { type: "finish" }));
  expect(roundTrip({ stage: "setup", setup, feedback: "Why" })).toEqual({ stage: "setup", setup, feedback: "Why" });
  expect(roundTrip({ ...taking, current: 2 })).toBeUndefined();
  expect(roundTrip({ ...taking, answers: [0] })).toBeUndefined();
  expect(roundTrip({ ...taking, answers: [7, null] })).toBeUndefined();
  expect(roundTrip({ ...taking, questions: [{ ...q(0), answer: 4 }, q(1)] })).toBeUndefined();
  expect(roundTrip({ ...taking, setup: { ...setup, count: 0 } })).toBeUndefined();
  expect(roundTrip("nonsense")).toBeUndefined();
});
