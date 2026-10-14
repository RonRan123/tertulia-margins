import { expect, test } from "vitest";
import { ASKED_LIMIT, checkQuestions, defaultSetup, pickAngles, freshQuiz, isAnswerFor, isGradeRequest, isQuizSetup, isRightAnswer, pickQuiz, quizBlocker, quizRisk, quizScore, quizStep, shuffleChoices, type QuizQuestion, type QuizSetup, type QuizState } from "./quiz.ts";

// A multiple-choice or true/false question, for reading its choices.
const asPick = (q: QuizQuestion) => q as Extract<QuizQuestion, { choices: unknown }>;

const pages = [{ page: "1", text: "The sky fell on Tuesday." }, { page: "2", text: "Nobody minded the sky." }];
const setup: QuizSetup = { topics: ["book-concepts"], count: 2, difficulty: "medium", styles: ["multiple-choice"] };
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
  expect(isQuizSetup({ ...setup, topics: ["characters", "who-said-it"] })).toBe(true); // D43
  expect(isQuizSetup({ ...setup, count: 0 })).toBe(false);
  expect(isQuizSetup({ ...setup, count: 11 })).toBe(false);
  expect(isQuizSetup({ ...setup, count: 2.5 })).toBe(false);
  expect(isQuizSetup({ ...setup, difficulty: "brutal" })).toBe(false);
  expect(isQuizSetup({ ...setup, styles: ["essay"] })).toBe(false);
  expect(isQuizSetup({ ...setup, styles: [] })).toBe(false);
  expect(quizBlocker({ ...setup, styles: [] }, "")).toBe("Choose at least one style.");
});

test("what the app says without asking the agent", () => {
  expect(quizBlocker({ ...setup, topics: [] }, "")).toBe("Choose at least one topic.");
  expect(quizBlocker(setup, "", "Add reference text first.")).toBe("Add reference text first.");
  expect(quizBlocker({ ...setup, topics: ["notes-terms"] }, "> “A copied quote from the book.”")).toMatch(/^Your notes have nothing of your own/);
  expect(quizBlocker({ ...setup, topics: ["notes-terms"] }, "irony — saying the opposite of what you mean")).toBeUndefined();
  expect(isQuizSetup({ ...setup, topics: ["check-reading"] })).toBe(false); // removed: a daemon's job (Ronith)
  expect(quizRisk(setup)).toBeUndefined();
  expect(quizRisk({ ...setup, topics: ["book-concepts", "notes-concepts"] })).toMatch(/take your notes as right/);
  expect(quizBlocker(setup, "")).toBeUndefined(); // book topics don't need notes
});

test("checks: a good question passes, with its right answer's index", () => {
  const { questions, rejected } = checkQuestions({ questions: [mc(), tf("The sky fell on Tuesday.", true)] }, { ...setup, styles: ["multiple-choice", "true-false"] }, pages, "");
  expect(rejected).toEqual([]);
  expect(questions[0]).toMatchObject({ topic: "book-concepts", kind: "multiple-choice", question: "When did the sky fall?", answer: 0 });
  expect(asPick(questions[0]).choices[0]).toEqual({ text: "On Tuesday", why: "Because of On Tuesday [p. 1]." });
  expect(questions[1]).toMatchObject({ kind: "true-false", answer: 0 });
});

test("checks: each way a question fails, with a reason", () => {
  const five = mc().choices as { text: string; correct: boolean; why: string }[];
  const cases: [unknown, RegExp][] = [
    [mc("Q", { topic: "notes-terms" }), /not one of the chosen topics/],
    [tf("The sky fell.", true), /not one of the chosen styles/],
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
  // Names vary in length naturally: a longer right name isn't a giveaway (D43).
  const names = ["Sir William Lucas", "Jane", "Lydia", "Kitty", "Mary"].map((text, i) => ({ text, correct: i === 0, why: "w" }));
  expect(checkQuestions({ questions: [mc("Who said “so far”?", { choices: names })] }, setup, pages, "").rejected).toEqual([]);
  const wrongTf = { ...tf("x", true), choices: [{ text: "Yes", correct: true, why: "w" }, { text: "No", correct: false, why: "w" }] };
  expect(checkQuestions({ questions: [wrongTf] }, { ...setup, styles: ["true-false"] }, pages, "").rejected[0].reason).toMatch(/True and False/);
  // A quote from the reader's notes is fine (a notes topic).
  const notesQuote = mc("Q", { choices: five.map((c, i) => (i === 0 ? { ...c, why: "You wrote “everyone panicked on the day”." } : c)) });
  expect(checkQuestions({ questions: [notesQuote] }, setup, pages, "Everyone panicked on the day.").questions).toHaveLength(1);
});

test("shuffling moves the right answer with its choice; true/false keeps True first", () => {
  const question = asPick(checkQuestions({ questions: [mc()] }, setup, pages, "").questions[0]);
  const reversed = asPick(shuffleChoices(question, () => 0)); // every swap with index 0
  expect(reversed.choices.map((c) => c.text)).not.toEqual(question.choices.map((c) => c.text));
  expect(reversed.choices[reversed.answer].text).toBe("On Tuesday");
  const [statement] = checkQuestions({ questions: [{ ...tf("x", false), choices: [{ text: "False", correct: true, why: "w" }, { text: "True", correct: false, why: "w" }] }] }, { ...setup, styles: ["true-false"] }, pages, "").questions;
  const ordered = asPick(shuffleChoices(statement));
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
  expect(quizStep(state, { type: "answer", answer: 5 })).toBe(state); // no such choice
  state = quizStep(state, { type: "answer", answer: 0 });
  expect(quizStep(state, { type: "answer", answer: 1 })).toBe(state); // answered once only
  state = quizStep(state, { type: "next" });
  expect(state).toMatchObject({ stage: "taking", current: 1 });
  state = quizStep(state, { type: "answer", answer: 0 });
  state = quizStep(state, { type: "next" }); // the last question → review
  expect(state).toMatchObject({ stage: "review", answers: [0, 0] });
  if (state.stage === "review") expect(quizScore(state.questions, state.answers)).toBe(1);
  expect(quizStep(state, { type: "answer", answer: 1 })).toBe(state);
  expect(quizStep(state, { type: "new" })).toEqual({ stage: "setup", setup: { ...setup, count: 2 }, asked: ["S?", "S?"] }); // remembered for the next quiz
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
  // Saved before styles became checkboxes: one style, or "mixed" for all of them.
  const oldSetup = { topics: setup.topics, count: setup.count, difficulty: setup.difficulty };
  expect(roundTrip({ stage: "setup", setup: { ...oldSetup, style: "true-false" } })).toEqual({ stage: "setup", setup: { ...oldSetup, styles: ["true-false"] } });
  expect(roundTrip({ stage: "setup", setup: { ...oldSetup, style: "mixed" } })).toMatchObject({ setup: { styles: ["multiple-choice", "true-false", "fill-blanks", "free-response"] } });
  // A removed topic is dropped; with none left, the default.
  expect(roundTrip({ stage: "setup", setup: { ...setup, topics: ["check-reading", "characters"] } })).toMatchObject({ setup: { topics: ["characters"] } });
  expect(roundTrip({ stage: "setup", setup: { ...setup, topics: ["check-reading"] } })).toMatchObject({ setup: { topics: ["book-concepts"] } });
});

// ---- Fill in the blanks and free response (D44) ----
const opts = (right: string, ...wrong: string[]) => [right, ...wrong].map((text, i) => ({ text, correct: i === 0, why: `${text}: why` }));
const blanksDraft = (question = "The sky fell on ___ and nobody minded the ___.", blanks = [opts("Tuesday", "Monday", "Friday", "Sunday"), opts("sky", "rain", "sea", "wind")]) => ({
  topic: "book-concepts",
  kind: "fill-blanks",
  question,
  choices: [],
  blanks: blanks.map((choices) => ({ choices })),
  modelAnswer: "",
  keyPoints: [],
});
const freeDraft = (over: Partial<{ modelAnswer: string; keyPoints: string[] }> = {}) => ({
  topic: "book-concepts",
  kind: "free-response",
  question: "What happened on Tuesday?",
  choices: [],
  blanks: [],
  modelAnswer: "The sky fell [p. 1], and nobody minded [p. 2].",
  keyPoints: ["The sky fell", "Nobody minded"],
  ...over,
});
const blanksSetup: QuizSetup = { ...setup, styles: ["fill-blanks"] };
const freeSetup: QuizSetup = { ...setup, styles: ["free-response"] };

test("fill in the blanks: 2–3 marked blanks of 4 options, each checked like a choice", () => {
  const { questions, rejected } = checkQuestions({ questions: [blanksDraft()] }, blanksSetup, pages, "");
  expect(rejected).toEqual([]);
  expect(questions[0]).toMatchObject({ kind: "fill-blanks", blanks: [{ answer: 0 }, { answer: 0 }] });
  const cases: [unknown, RegExp][] = [
    [blanksDraft("Only ___ here.", [opts("Tuesday", "Monday", "Friday", "Sunday")]), /needs 2–3 blanks/],
    [blanksDraft("The sky fell on ___ and nobody minded."), /mark each blank with ___/],
    [blanksDraft(undefined, [opts("Tuesday", "Monday", "Friday"), opts("sky", "rain", "sea", "wind")]), /a blank: needs exactly 4 choices/],
    [blanksDraft(undefined, [opts("Tuesday", "Monday", "Friday", "Sunday"), opts("sky", "sky", "sea", "wind")]), /a blank: two choices are the same/],
  ];
  for (const [draft, reason] of cases) expect(checkQuestions({ questions: [draft] }, blanksSetup, pages, "").rejected[0].reason).toMatch(reason);
  // Each blank's options are shuffled on their own, the right one followed.
  const shuffled = shuffleChoices(questions[0], () => 0);
  if (shuffled.kind !== "fill-blanks") throw new Error("kind");
  expect(shuffled.blanks.map((b) => b.choices[b.answer].text)).toEqual(["Tuesday", "sky"]);
});

test("free response: a model answer and 1–4 key points, quotes checked", () => {
  const { questions } = checkQuestions({ questions: [freeDraft()] }, freeSetup, pages, "");
  expect(questions[0]).toEqual({ topic: "book-concepts", kind: "free-response", question: "What happened on Tuesday?", modelAnswer: "The sky fell [p. 1], and nobody minded [p. 2].", keyPoints: ["The sky fell", "Nobody minded"] });
  expect(checkQuestions({ questions: [freeDraft({ modelAnswer: " " })] }, freeSetup, pages, "").rejected[0].reason).toMatch(/model answer/);
  expect(checkQuestions({ questions: [freeDraft({ keyPoints: [] })] }, freeSetup, pages, "").rejected[0].reason).toMatch(/1–4 key points/);
  expect(checkQuestions({ questions: [freeDraft({ modelAnswer: "It says “the moon fell on Tuesday” [p. 1]." })] }, freeSetup, pages, "").rejected[0].reason).toMatch(/aren't in the book/);
  expect(checkQuestions({ questions: [freeDraft()] }, setup, pages, "").rejected[0].reason).toMatch(/not one of the chosen styles/);
});

const blanksQ: QuizQuestion = { topic: "book-concepts", kind: "fill-blanks", question: "A ___ B ___.", blanks: [0, 1].map((answer) => ({ choices: ["w", "x", "y", "z"].map((text) => ({ text, why: "w" })), answer })) };
const freeQ: QuizQuestion = { topic: "book-concepts", kind: "free-response", question: "Why?", modelAnswer: "Because.", keyPoints: ["Because"] };

test("answers fit their question's kind; scoring: every blank right, only a 'right' free response", () => {
  expect(isAnswerFor(blanksQ, [0, 1])).toBe(true);
  expect(isAnswerFor(blanksQ, [0])).toBe(false);
  expect(isAnswerFor(blanksQ, [0, 4])).toBe(false);
  expect(isAnswerFor(blanksQ, 0)).toBe(false);
  expect(isAnswerFor(freeQ, { text: "Mine" })).toBe(true);
  expect(isAnswerFor(freeQ, { text: " " })).toBe(false);
  expect(isAnswerFor(freeQ, { text: "x".repeat(2001) })).toBe(false);
  expect(isAnswerFor(freeQ, { text: "Mine", verdict: "maybe", feedback: "" })).toBe(false);
  expect(isRightAnswer(blanksQ, [0, 1])).toBe(true);
  expect(isRightAnswer(blanksQ, [0, 0])).toBe(false);
  expect(isRightAnswer(freeQ, { text: "Mine", verdict: "right", feedback: "f" })).toBe(true);
  expect(isRightAnswer(freeQ, { text: "Mine", verdict: "partial", feedback: "f" })).toBe(false); // D44: partly right doesn't score
  expect(isRightAnswer(freeQ, { text: "Mine" })).toBe(false);
});

test("a free response: submitted once, graded once, then saved and loaded back", () => {
  let state = quizStep({ stage: "setup", setup: freeSetup }, { type: "started", questions: [freeQ, freeQ] });
  expect(quizStep(state, { type: "answer", answer: { text: "  " } })).toBe(state); // empty
  state = quizStep(state, { type: "answer", answer: { text: " Mine ", verdict: "right", feedback: "self-graded?" } });
  expect(state).toMatchObject({ answers: [{ text: "Mine" }, null] }); // the reader can't grade their own
  expect(quizStep(state, { type: "graded", index: 1, verdict: "right", feedback: "f" })).toBe(state); // not answered
  state = quizStep(state, { type: "graded", index: 0, verdict: "partial", feedback: "You missed why." });
  expect(state).toMatchObject({ answers: [{ text: "Mine", verdict: "partial", feedback: "You missed why." }, null] });
  expect(quizStep(state, { type: "graded", index: 0, verdict: "right", feedback: "again" })).toBe(state); // graded once
  expect(pickQuiz(JSON.parse(JSON.stringify(state)))).toEqual(state);
  // Skipping the grade still moves on; a grade that lands after "End quiz" still counts.
  let skipped = quizStep(quizStep(state, { type: "next" }), { type: "answer", answer: { text: "Later" } });
  skipped = quizStep(skipped, { type: "finish" });
  skipped = quizStep(skipped, { type: "graded", index: 1, verdict: "right", feedback: "f" });
  expect(skipped).toMatchObject({ stage: "review", answers: [{ verdict: "partial" }, { verdict: "right" }] });
});

test("a grading request: question, model answer, up to 4 key points, an answer", () => {
  const grade = { question: "Why?", modelAnswer: "Because.", keyPoints: ["Because"], answer: "Mine" };
  expect(isGradeRequest(grade)).toBe(true);
  expect(isGradeRequest({ ...grade, answer: "" })).toBe(false);
  expect(isGradeRequest({ ...grade, keyPoints: ["a", "b", "c", "d", "e"] })).toBe(false);
  expect(isGradeRequest({ ...grade, answer: "x".repeat(2001) })).toBe(false);
});

test("variety: angles at random, none repeated until all are used; recent questions remembered, the last 30", () => {
  const six = pickAngles(6, () => 0.5);
  expect(new Set(six).size).toBe(6);
  expect(pickAngles(8, () => 0.5).slice(6)).toHaveLength(2);
  expect(pickAngles(3, () => 0)).not.toEqual(pickAngles(3, () => 0.99));
  let state: QuizState = { stage: "setup", setup, asked: Array.from({ length: 29 }, (_, i) => `old ${i}`) };
  state = quizStep(state, { type: "started", questions: [q(0), q(1)] });
  expect(state.asked).toHaveLength(ASKED_LIMIT);
  expect(state.asked?.slice(-2)).toEqual(["S?", "S?"]);
  expect(state.asked?.[0]).toBe("old 1"); // the oldest dropped
  expect(pickQuiz(JSON.parse(JSON.stringify(state)))).toEqual(state);
  expect(pickQuiz({ ...state, asked: "nope" })).not.toHaveProperty("asked");
});
