// Quiz (D42): the reader tests themselves on the book and their notes. They choose topics, a number
// of questions, a difficulty and a style; a quiz agent (core/converse) writes the questions as JSON
// or says why the material can't support them; this module checks every question, shuffles the
// choices, scores answers, and runs the quiz as a small state machine, saved with the book. Free
// responses are graded by a separate agent call (D44). Pure and browser-safe.
import { checkCitations } from "./citations.ts";
import { ownLines } from "./daemons.ts";
import type { BookPage } from "./passage.ts";

// Grouped by source, in the order the setup lists them (D43). `hint`: the line under the label.
// `ask`: how the quiz agent is told what the topic covers. Ids predate D43's labels, so saved
// quizzes still load.
export const QUIZ_TOPICS = {
  "book-terms": { label: "Vocabulary", hint: "words the book uses", source: "book", ask: "words the book uses that a reader may not know, or that carry a special meaning in it" },
  "book-concepts": { label: "Big ideas", hint: "themes, arguments, turning points", source: "book", ask: "the book's themes, arguments and turning points" },
  characters: { label: "Characters", hint: "who's who, motives, relationships", source: "book", ask: "the book's characters: who they are, what drives them, and how they relate to each other" },
  "who-said-it": { label: "Who said it?", hint: "match a line to its speaker", source: "book", ask: "lines of dialogue or writing from the book, quoted exactly, to be matched to who said or wrote them" },
  "notes-terms": { label: "My vocabulary", hint: "words I've defined", source: "notes", ask: "words or terms the reader defines in their notes" },
  "notes-concepts": { label: "My ideas", hint: "the claims and connections I made", source: "notes", ask: "the ideas, claims and connections the reader makes in their notes, taken as true" },
} as const;
export const QUIZ_SOURCES = { book: "From the book", notes: "From my notes" } as const;
export type QuizTopic = keyof typeof QUIZ_TOPICS;
export const QUIZ_TOPIC_IDS = Object.keys(QUIZ_TOPICS) as QuizTopic[];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// Question styles (D42, D44), chosen as checkboxes: one or more; several mix them (Ronith).
export const QUIZ_STYLES = {
  "multiple-choice": { label: "Multiple choice" },
  "true-false": { label: "True / false" },
  "fill-blanks": { label: "Fill in the blanks" },
  "free-response": { label: "Free response" },
} as const;
export type QuestionKind = keyof typeof QUIZ_STYLES;
export const QUESTION_KINDS = Object.keys(QUIZ_STYLES) as QuestionKind[];
export const CHOICES_PER_QUESTION = 5; // multiple choice
export const OPTIONS_PER_BLANK = 4; // each dropdown of a fill-in-the-blanks question
export const BLANK_LIMITS = { min: 2, max: 3 };
export const BLANK = "___"; // marks each blank in a fill-in-the-blanks question
export const KEY_POINT_LIMITS = { min: 1, max: 4 }; // what a full free response must cover
export const QUESTION_LIMITS = { min: 1, max: 10 };
export const FREE_ANSWER_CHARS = 2_000;

export type QuizSetup = { topics: QuizTopic[]; count: number; difficulty: Difficulty; styles: QuestionKind[] };

// Variety (Ronith): each book remembers the questions it asked recently, and a new quiz is told
// not to repeat them; and our code gives each question an angle at random, so the same passage
// yields a different question.
export const ASKED_LIMIT = 30;
export const ANGLES = {
  cause: "why something happens",
  consequence: "what follows from an event or choice",
  motive: "what drives a character",
  comparison: "how two characters, scenes or ideas differ or echo each other",
  "turning point": "what changes, and why it matters",
  "detail in context": "what a specific line or detail shows",
} as const;
export type Angle = keyof typeof ANGLES;
const ANGLE_IDS = Object.keys(ANGLES) as Angle[];

// `count` angles in a random order, none repeated until every one has been used.
export function pickAngles(count: number, random = Math.random): Angle[] {
  const angles: Angle[] = [];
  while (angles.length < count) {
    const round = [...ANGLE_IDS];
    for (let i = round.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [round[i], round[j]] = [round[j], round[i]];
    }
    angles.push(...round);
  }
  return angles.slice(0, count);
}

// The questions a quiz request asks the agent not to repeat: up to ASKED_LIMIT short strings.
export const isAvoidList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length <= ASKED_LIMIT && v.every((q) => typeof q === "string" && q.length <= 1_000);
export const defaultSetup: QuizSetup = { topics: ["book-concepts"], count: 5, difficulty: "medium", styles: ["multiple-choice"] };

// Every choice says why it is right or wrong. `answer`: the index of the right choice.
export type Choice = { text: string; why: string };
export type Pick = { choices: Choice[]; answer: number };
export type QuizQuestion =
  | ({ topic: QuizTopic; kind: "multiple-choice" | "true-false"; question: string } & Pick)
  // `question` holds one BLANK per entry of `blanks`, in order.
  | { topic: QuizTopic; kind: "fill-blanks"; question: string; blanks: Pick[] }
  | { topic: QuizTopic; kind: "free-response"; question: string; modelAnswer: string; keyPoints: string[] };

// A free response, and once graded, the verdict and one line of feedback. Only "right" scores (D44).
export type Verdict = "right" | "partial" | "wrong";
export const VERDICTS: Verdict[] = ["right", "partial", "wrong"];
export type FreeAnswer = { text: string; verdict?: Verdict; feedback?: string };
// A choice's index, every blank's chosen index, or a free response; null until answered.
export type QuizAnswer = number | number[] | FreeAnswer | null;

export function isQuizSetup(v: unknown): v is QuizSetup {
  if (!isRecord(v)) return false;
  const { topics, count, difficulty, styles } = v;
  const areTopicsValid = Array.isArray(topics) && topics.length > 0 && topics.every((t) => QUIZ_TOPIC_IDS.includes(t as QuizTopic));
  const isCountValid = Number.isInteger(count) && (count as number) >= QUESTION_LIMITS.min && (count as number) <= QUESTION_LIMITS.max;
  const areStylesValid = Array.isArray(styles) && styles.length > 0 && styles.every((s) => QUESTION_KINDS.includes(s as QuestionKind));
  return areTopicsValid && isCountValid && DIFFICULTIES.includes(difficulty as Difficulty) && areStylesValid;
}

// What the app can tell without asking the agent, or undefined. `aiBlock` is the page's reason the
// AI can't be asked (no reference text, over the cap, the day's replies used up).
// A warning, not a blocker: My ideas takes the reader's notes as true and Big ideas takes the book,
// so where they disagree, a question's answer depends on which topic it came from (Ronith).
export function quizRisk(setup: QuizSetup): string | undefined {
  const isBoth = setup.topics.includes("book-concepts") && setup.topics.includes("notes-concepts");
  if (isBoth) return "Heads up: “My ideas” questions take your notes as right, and “Big ideas” questions take the book as right. Where your notes and the book disagree, the right answer depends on which topic a question comes from (shown above each question).";
}

export function quizBlocker(setup: QuizSetup, notes: string, aiBlock?: string): string | undefined {
  if (setup.topics.length === 0) return "Choose at least one topic.";
  if (setup.styles.length === 0) return "Choose at least one style.";
  if (aiBlock) return aiBlock;
  const isNotesTopic = setup.topics.some((t) => QUIZ_TOPICS[t].source === "notes");
  const hasOwnWords = notes.split("\n").some((line) => ownLines(line) > 0);
  if (isNotesTopic && !hasOwnWords) return "Your notes have nothing of your own to quiz you on yet. Write some notes, or choose a topic from the book.";
}

// ---- The agent's answer ----

// The JSON the quiz agent replies with (structured outputs). One question shape serves every kind:
// the fields another kind needs are left empty ([] or ""). `feedback`: why the material can't
// support the request (verdict "insufficient"), else "".
export function quizSchema(setup: QuizSetup) {
  const choice = {
    type: "object",
    properties: { text: { type: "string" }, correct: { type: "boolean" }, why: { type: "string" } },
    required: ["text", "correct", "why"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      verdict: { type: "string", enum: ["ok", "insufficient"] },
      feedback: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            topic: { type: "string", enum: setup.topics },
            kind: { type: "string", enum: setup.styles },
            question: { type: "string" },
            choices: { type: "array", items: choice },
            blanks: {
              type: "array",
              items: { type: "object", properties: { choices: { type: "array", items: choice } }, required: ["choices"], additionalProperties: false },
            },
            modelAnswer: { type: "string" },
            keyPoints: { type: "array", items: { type: "string" } },
          },
          required: ["topic", "kind", "question", "choices", "blanks", "modelAnswer", "keyPoints"],
          additionalProperties: false,
        },
      },
    },
    required: ["verdict", "feedback", "questions"],
    additionalProperties: false,
  };
}

// A right answer this much longer than the average wrong one gives itself away; short answers
// (names, single words) vary in length naturally, so it must also be this many characters longer.
const GIVEAWAY_RATIO = 1.5;
const GIVEAWAY_CHARS = 20;
const CATCH_ALL = /\b(all|none|both|neither) of the (above|others)\b/i;

type DraftChoice = { text: string; correct: boolean; why: string };

// The agent's questions → the ones fit to ask, and why each other one isn't. A question must match
// the setup (topic, kind) and its kind's shape: 5 choices (or True and False, or 2–3 blanks of 4
// options), exactly one right per pick, none repeated or a catch-all, a right answer that isn't
// conspicuously the longest; a free response needs a model answer and 1–4 key points. Quotes must be
// in the book or the notes (D38).
export function checkQuestions(output: unknown, setup: QuizSetup, pages: BookPage[], notes: string) {
  const drafts = isRecord(output) && Array.isArray(output.questions) ? output.questions : [];
  const questions: QuizQuestion[] = [];
  const rejected: { question: string; reason: string }[] = [];
  for (const draft of drafts) {
    const text = isRecord(draft) && typeof draft.question === "string" ? draft.question.trim() : "";
    const checked = checkQuestion(draft, setup, pages, notes);
    if (typeof checked === "string") rejected.push({ question: text, reason: checked });
    else questions.push(checked);
  }
  return { questions, rejected };
}

function checkQuestion(draft: unknown, setup: QuizSetup, pages: BookPage[], notes: string): QuizQuestion | string {
  if (!isRecord(draft) || !isText(draft.question)) return "incomplete";
  if (!setup.topics.includes(draft.topic as QuizTopic)) return "not one of the chosen topics";
  if (!setup.styles.includes(draft.kind as QuestionKind)) return "not one of the chosen styles";
  const topic = draft.topic as QuizTopic;
  const question = draft.question.trim();
  const isQuoteOk = (texts: unknown[]) => checkCitations(texts.join("\n"), pages, notes).every((c) => c.status === "ok");
  const badQuote = "quotes words that aren't in the book or the notes, or cites the wrong page";

  if (draft.kind === "free-response") {
    const points = Array.isArray(draft.keyPoints) ? draft.keyPoints.filter(isText).map((p) => p.trim()) : [];
    if (!isText(draft.modelAnswer)) return "a free response needs a model answer";
    const hasPoints = points.length >= KEY_POINT_LIMITS.min && points.length <= KEY_POINT_LIMITS.max;
    if (!hasPoints) return `a free response needs ${KEY_POINT_LIMITS.min}–${KEY_POINT_LIMITS.max} key points`;
    if (!isQuoteOk([question, draft.modelAnswer, ...points])) return badQuote;
    return { topic, kind: "free-response", question, modelAnswer: draft.modelAnswer.trim(), keyPoints: points };
  }

  if (draft.kind === "fill-blanks") {
    const blanks = Array.isArray(draft.blanks) ? draft.blanks : [];
    const hasBlankCount = blanks.length >= BLANK_LIMITS.min && blanks.length <= BLANK_LIMITS.max;
    if (!hasBlankCount) return `needs ${BLANK_LIMITS.min}–${BLANK_LIMITS.max} blanks`;
    if (question.split(BLANK).length - 1 !== blanks.length) return `the sentence must mark each blank with ${BLANK}`;
    const picks: Pick[] = [];
    for (const blank of blanks) {
      const pick = checkPick(isRecord(blank) ? blank.choices : undefined, OPTIONS_PER_BLANK, false);
      if (typeof pick === "string") return `a blank: ${pick}`;
      picks.push(pick);
    }
    if (!isQuoteOk([question, ...picks.flatMap((p) => p.choices.flatMap((c) => [c.text, c.why]))])) return badQuote;
    return { topic, kind: "fill-blanks", question, blanks: picks };
  }

  const isTrueFalse = draft.kind === "true-false";
  const pick = checkPick(draft.choices, isTrueFalse ? 2 : CHOICES_PER_QUESTION, isTrueFalse);
  if (typeof pick === "string") return pick;
  if (!isQuoteOk([question, ...pick.choices.flatMap((c) => [c.text, c.why])])) return badQuote;
  return { topic, kind: isTrueFalse ? "true-false" : "multiple-choice", question, ...pick };
}

// One set of options with one right: a multiple-choice or true/false question, or one blank.
function checkPick(raw: unknown, count: number, isTrueFalse: boolean): Pick | string {
  if (!Array.isArray(raw)) return "incomplete";
  const choices = raw.filter((c): c is DraftChoice => isRecord(c) && isText(c.text) && isText(c.why) && typeof c.correct === "boolean");
  if (choices.length !== raw.length) return "a choice is missing its text or explanation";
  const texts = choices.map((c) => c.text.trim());
  const hasRightChoices = isTrueFalse ? texts.map((t) => t.toLowerCase()).sort().join() === "false,true" : texts.length === count;
  if (!hasRightChoices) return isTrueFalse ? "a true/false question needs exactly the choices True and False" : `needs exactly ${count} choices`;
  const right = choices.filter((c) => c.correct);
  if (right.length !== 1) return "needs exactly one right answer";
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) return "two choices are the same";
  if (texts.some((t) => CATCH_ALL.test(t))) return "uses an all/none-of-the-above choice";
  if (!isTrueFalse) {
    const rightLength = right[0].text.trim().length;
    const others = texts.filter((t) => t !== right[0].text.trim()).map((t) => t.length);
    const average = others.reduce((sum, n) => sum + n, 0) / others.length;
    const isGiveaway = rightLength > GIVEAWAY_RATIO * average && rightLength - average >= GIVEAWAY_CHARS && rightLength > Math.max(...others);
    if (isGiveaway) return "the right answer is much longer than the others, which gives it away";
  }
  return { choices: choices.map((c) => ({ text: c.text.trim(), why: c.why.trim() })), answer: choices.findIndex((c) => c.correct) };
}

// Options in a random order, so the right one isn't always where the model put it: a multiple-choice
// question's, and each blank's. True/false keeps True first; a free response has none.
export function shuffleChoices(question: QuizQuestion, random = Math.random): QuizQuestion {
  if (question.kind === "free-response") return question;
  if (question.kind === "fill-blanks") return { ...question, blanks: question.blanks.map((b) => shufflePick(b, random)) };
  if (question.kind === "true-false") {
    const trueFirst = [...question.choices].sort((a, b) => (a.text.toLowerCase() === "true" ? -1 : b.text.toLowerCase() === "true" ? 1 : 0));
    return { ...question, choices: trueFirst, answer: trueFirst.indexOf(question.choices[question.answer]) };
  }
  return { ...question, ...shufflePick(question, random) };
}

function shufflePick({ choices, answer }: Pick, random: () => number): Pick {
  const order = choices.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { choices: order.map((i) => choices[i]), answer: order.indexOf(answer) };
}

// A free response to grade (D44): the grader sees the question, the model answer, the key points
// and the pages they cite, never the whole book.
export type GradeRequest = { question: string; modelAnswer: string; keyPoints: string[]; answer: string };
export function isGradeRequest(v: unknown): v is GradeRequest {
  if (!isRecord(v)) return false;
  const { question, modelAnswer, keyPoints, answer } = v;
  const arePointsValid = Array.isArray(keyPoints) && keyPoints.length <= KEY_POINT_LIMITS.max && keyPoints.every((p) => typeof p === "string");
  return isText(question) && isText(modelAnswer) && arePointsValid && isText(answer) && answer.length <= FREE_ANSWER_CHARS;
}

// ---- Answers ----

// Whether `answer` fits `question`'s kind: a choice in range, a choice per blank, or a free response.
export function isAnswerFor(question: QuizQuestion, answer: unknown): answer is Exclude<QuizAnswer, null> {
  const isIndex = (a: unknown, pick: Pick) => Number.isInteger(a) && (a as number) >= 0 && (a as number) < pick.choices.length;
  if (question.kind === "free-response") {
    const isGraded = isRecord(answer) && (answer.verdict === undefined || (VERDICTS.includes(answer.verdict as Verdict) && typeof answer.feedback === "string"));
    return isGraded && isText((answer as FreeAnswer).text) && (answer as FreeAnswer).text.length <= FREE_ANSWER_CHARS;
  }
  if (question.kind === "fill-blanks") return Array.isArray(answer) && answer.length === question.blanks.length && answer.every((a, i) => isIndex(a, question.blanks[i]));
  return isIndex(answer, question);
}

export function isRightAnswer(question: QuizQuestion, answer: QuizAnswer): boolean {
  if (answer === null) return false;
  if (question.kind === "free-response") return typeof answer === "object" && !Array.isArray(answer) && answer.verdict === "right";
  if (question.kind === "fill-blanks") return Array.isArray(answer) && question.blanks.every((b, i) => answer[i] === b.answer);
  return answer === question.answer;
}

export const quizScore = (questions: QuizQuestion[], answers: QuizAnswer[]) => questions.filter((q, i) => isRightAnswer(q, answers[i])).length;

// ---- Taking a quiz ----
// Setup (with the agent's or the app's feedback after a refused Start), then one question at a
// time, then a review. `answers[i]`: question i's answer, or null. `note`: the quiz is shorter than
// asked because some questions failed the checks.
// `asked`: the book's recent questions (newest last), carried through every stage.
export type QuizState = { asked?: string[] } & (
  | { stage: "setup"; setup: QuizSetup; feedback?: string }
  | { stage: "taking"; setup: QuizSetup; questions: QuizQuestion[]; answers: QuizAnswer[]; current: number; note?: string }
  | { stage: "review"; setup: QuizSetup; questions: QuizQuestion[]; answers: QuizAnswer[]; note?: string }
);

export type QuizAction =
  | { type: "setup"; setup: QuizSetup } // the reader changes a choice
  | { type: "refused"; feedback: string } // Start didn't produce a quiz: why
  | { type: "started"; questions: QuizQuestion[] }
  | { type: "answer"; answer: Exclude<QuizAnswer, null> } // the current question's, once
  | { type: "graded"; index: number; verdict: Verdict; feedback: string } // a free response's grade
  | { type: "next" } // after answering: the next question, or the review after the last
  | { type: "finish" } // end early: review what's answered
  | { type: "new" }; // back to setup, keeping the last choices

export const freshQuiz = (): QuizState => ({ stage: "setup", setup: defaultSetup });

// Every action that doesn't fit the current stage leaves the state as it is, so a double click or
// a stale button can't skip a question, answer twice or regrade.
export function quizStep(state: QuizState, action: QuizAction): QuizState {
  const asked = state.asked ? { asked: state.asked } : {};
  switch (action.type) {
    case "setup":
      return state.stage === "setup" ? { stage: "setup", setup: action.setup, ...asked } : state;
    case "refused":
      return state.stage === "setup" ? { ...state, feedback: action.feedback } : state;
    case "started": {
      if (state.stage !== "setup" || action.questions.length === 0) return state;
      const { questions } = action;
      const isShort = questions.length < state.setup.count;
      const note = isShort ? `${questions.length} of the ${state.setup.count} questions passed our checks, so this quiz is shorter.` : undefined;
      const recent = [...(state.asked ?? []), ...questions.map((q) => q.question)].slice(-ASKED_LIMIT);
      return { stage: "taking", setup: state.setup, questions, answers: questions.map(() => null), current: 0, ...(note && { note }), asked: recent };
    }
    case "answer": {
      if (state.stage !== "taking" || state.answers[state.current] !== null) return state;
      const question = state.questions[state.current];
      const answer = question.kind === "free-response" && isRecord(action.answer) ? { text: (action.answer as FreeAnswer).text.trim() } : action.answer;
      if (!isAnswerFor(question, answer)) return state;
      return { ...state, answers: state.answers.map((a, i) => (i === state.current ? answer : a)) };
    }
    case "graded": {
      if (state.stage !== "taking" && state.stage !== "review") return state;
      const answer = state.answers[action.index];
      const isUngraded = state.questions[action.index]?.kind === "free-response" && isRecord(answer) && (answer as FreeAnswer).verdict === undefined;
      if (!isUngraded || !VERDICTS.includes(action.verdict)) return state;
      const graded: FreeAnswer = { text: (answer as FreeAnswer).text, verdict: action.verdict, feedback: action.feedback };
      return { ...state, answers: state.answers.map((a, i) => (i === action.index ? graded : a)) };
    }
    case "next": {
      if (state.stage !== "taking" || state.answers[state.current] === null) return state;
      const isLast = state.current === state.questions.length - 1;
      return isLast ? toReview(state) : { ...state, current: state.current + 1 };
    }
    case "finish":
      return state.stage === "taking" ? toReview(state) : state;
    case "new":
      return { stage: "setup", setup: state.setup, ...asked };
  }
}

const toReview = ({ setup, questions, answers, note, asked }: Extract<QuizState, { stage: "taking" }>): QuizState => ({
  stage: "review",
  setup,
  questions,
  answers,
  ...(note && { note }),
  ...(asked && { asked }),
});

// A saved quiz (store): anything malformed loads as a fresh setup, never a broken quiz.
export function pickQuiz(saved: unknown): QuizState | undefined {
  if (!isRecord(saved)) return undefined;
  const setup = withStyles(saved.setup);
  if (!isQuizSetup(setup)) return undefined;
  const asked = isAvoidList(saved.asked) ? { asked: saved.asked } : {};
  if (saved.stage === "setup") return { stage: "setup", setup, ...(isText(saved.feedback) && { feedback: saved.feedback }), ...asked };
  const questions = Array.isArray(saved.questions) ? saved.questions : [];
  const answers = Array.isArray(saved.answers) ? saved.answers : [];
  const areQuestionsValid = questions.length > 0 && questions.every(isQuestion);
  const areAnswersValid = answers.length === questions.length && answers.every((a, i) => a === null || isAnswerFor(questions[i], a));
  if (!areQuestionsValid || !areAnswersValid) return undefined;
  const note = isText(saved.note) ? { note: saved.note } : {};
  if (saved.stage === "review") return { stage: "review", setup, questions, answers, ...note, ...asked };
  const isCurrentValid = Number.isInteger(saved.current) && (saved.current as number) >= 0 && (saved.current as number) < questions.length;
  if (saved.stage !== "taking" || !isCurrentValid) return undefined;
  return { stage: "taking", setup, questions, answers, current: saved.current as number, ...note, ...asked };
}

// An older saved setup: one `style` before styles became checkboxes ("mixed": all of them), and
// topics since removed ("Check my reading"), dropped; with none left, the default topic.
function withStyles(setup: unknown): unknown {
  if (!isRecord(setup)) return setup;
  const known = Array.isArray(setup.topics) ? setup.topics.filter((t) => QUIZ_TOPIC_IDS.includes(t as QuizTopic)) : setup.topics;
  const topics = Array.isArray(known) && known.length === 0 ? defaultSetup.topics : known;
  if (setup.styles !== undefined || typeof setup.style !== "string") return { ...setup, topics };
  const { style, ...rest } = setup;
  return { ...rest, topics, styles: style === "mixed" ? QUESTION_KINDS : [style] };
}

const isPick = (p: unknown): p is Pick =>
  isRecord(p) &&
  Array.isArray(p.choices) &&
  p.choices.length >= 2 &&
  p.choices.every((c) => isRecord(c) && typeof c.text === "string" && typeof c.why === "string") &&
  Number.isInteger(p.answer) &&
  (p.answer as number) >= 0 &&
  (p.answer as number) < p.choices.length;

function isQuestion(q: unknown): q is QuizQuestion {
  if (!isRecord(q) || !QUIZ_TOPIC_IDS.includes(q.topic as QuizTopic) || !isText(q.question)) return false;
  if (q.kind === "multiple-choice" || q.kind === "true-false") return isPick(q);
  if (q.kind === "fill-blanks") return Array.isArray(q.blanks) && q.blanks.length > 0 && q.blanks.every(isPick);
  if (q.kind === "free-response") return isText(q.modelAnswer) && Array.isArray(q.keyPoints) && q.keyPoints.every((p) => typeof p === "string");
  return false;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
