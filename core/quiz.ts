// Quiz (D42): the reader tests themselves on the book and their notes. They choose topics, a number
// of questions, a difficulty and a style; a quiz agent (core/converse) writes the questions as JSON
// or says why the material can't support them; this module checks every question, shuffles the
// choices, and runs the quiz as a small state machine, saved with the book. Pure and browser-safe.
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
  "notes-concepts": { label: "My ideas", hint: "the claims and connections I made", source: "notes", ask: "the ideas, claims and connections the reader makes in their notes" },
  "check-reading": { label: "Check my reading", hint: "does the book back up what I wrote?", source: "notes", ask: "claims the reader makes in their notes, tested against the book: supported, contradicted, or not settled by the text" },
} as const;
export const QUIZ_SOURCES = { book: "From the book", notes: "From my notes" } as const;
export type QuizTopic = keyof typeof QUIZ_TOPICS;
export const QUIZ_TOPIC_IDS = Object.keys(QUIZ_TOPICS) as QuizTopic[];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// A question is multiple choice (5 choices) or true/false; "mixed" lets the agent pick per question.
export const QUIZ_STYLES = {
  "multiple-choice": { label: "Multiple choice" },
  "true-false": { label: "True / false" },
  mixed: { label: "Mixed" },
} as const;
export type QuizStyle = keyof typeof QUIZ_STYLES;
export type QuestionKind = "multiple-choice" | "true-false";
export const CHOICES_PER_QUESTION = 5; // multiple choice
export const QUESTION_LIMITS = { min: 1, max: 10 };

export type QuizSetup = { topics: QuizTopic[]; count: number; difficulty: Difficulty; style: QuizStyle };
export const defaultSetup: QuizSetup = { topics: ["book-concepts"], count: 5, difficulty: "medium", style: "multiple-choice" };

// `answer`: the index of the right choice. Every choice says why it is right or wrong.
export type QuizQuestion = { topic: QuizTopic; kind: QuestionKind; question: string; choices: { text: string; why: string }[]; answer: number };

export function isQuizSetup(v: unknown): v is QuizSetup {
  if (!isRecord(v)) return false;
  const { topics, count, difficulty, style } = v;
  const areTopicsValid = Array.isArray(topics) && topics.length > 0 && topics.every((t) => QUIZ_TOPIC_IDS.includes(t as QuizTopic));
  const isCountValid = Number.isInteger(count) && (count as number) >= QUESTION_LIMITS.min && (count as number) <= QUESTION_LIMITS.max;
  return areTopicsValid && isCountValid && DIFFICULTIES.includes(difficulty as Difficulty) && Object.hasOwn(QUIZ_STYLES, style as string);
}

// What the app can tell without asking the agent, or undefined. `aiBlock` is the page's reason the
// AI can't be asked (no reference text, over the cap, the day's replies used up).
export function quizBlocker(setup: QuizSetup, notes: string, aiBlock?: string): string | undefined {
  if (setup.topics.length === 0) return "Choose at least one topic.";
  if (aiBlock) return aiBlock;
  const isNotesTopic = setup.topics.some((t) => QUIZ_TOPICS[t].source === "notes");
  const hasOwnWords = notes.split("\n").some((line) => ownLines(line) > 0);
  if (isNotesTopic && !hasOwnWords) return "Your notes have nothing of your own to quiz you on yet. Write some notes, or choose a topic from the book.";
}

// ---- The agent's answer ----

// The JSON the quiz agent replies with (structured outputs). `feedback`: why the material can't
// support the request (verdict "insufficient"), else "".
export function quizSchema(setup: QuizSetup) {
  const kinds: QuestionKind[] = setup.style === "mixed" ? ["multiple-choice", "true-false"] : [setup.style];
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
            kind: { type: "string", enum: kinds },
            question: { type: "string" },
            choices: {
              type: "array",
              items: {
                type: "object",
                properties: { text: { type: "string" }, correct: { type: "boolean" }, why: { type: "string" } },
                required: ["text", "correct", "why"],
                additionalProperties: false,
              },
            },
          },
          required: ["topic", "kind", "question", "choices"],
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

// The agent's questions → the ones fit to ask, and why each other one isn't. A question must match
// the setup (topic, kind), have the right choices (5, or True and False), exactly one right, none
// repeated or a catch-all, a right answer that isn't conspicuously the longest, and quotes that are
// in the book or the notes (D38).
export function checkQuestions(output: unknown, setup: QuizSetup, pages: BookPage[], notes: string) {
  const drafts = isRecord(output) && Array.isArray(output.questions) ? output.questions : [];
  const questions: QuizQuestion[] = [];
  const rejected: { question: string; reason: string }[] = [];
  for (const draft of drafts) {
    const text = isRecord(draft) && typeof draft.question === "string" ? draft.question.trim() : "";
    const reason = questionProblem(draft, setup, pages, notes);
    if (reason) {
      rejected.push({ question: text, reason });
      continue;
    }
    const d = draft as { topic: QuizTopic; kind: QuestionKind; choices: { text: string; correct: boolean; why: string }[] };
    const choices = d.choices.map((c) => ({ text: c.text.trim(), why: c.why.trim() }));
    questions.push({ topic: d.topic, kind: d.kind, question: text, choices, answer: d.choices.findIndex((c) => c.correct) });
  }
  return { questions, rejected };
}

function questionProblem(draft: unknown, setup: QuizSetup, pages: BookPage[], notes: string): string | undefined {
  if (!isRecord(draft) || !isText(draft.question) || !Array.isArray(draft.choices)) return "incomplete";
  if (!setup.topics.includes(draft.topic as QuizTopic)) return "not one of the chosen topics";
  const kinds = setup.style === "mixed" ? ["multiple-choice", "true-false"] : [setup.style];
  if (!kinds.includes(draft.kind as string)) return "not the chosen style";
  const choices = draft.choices.filter((c) => isRecord(c) && isText(c.text) && isText(c.why) && typeof c.correct === "boolean");
  if (choices.length !== draft.choices.length) return "a choice is missing its text or explanation";
  const texts = choices.map((c) => (c.text as string).trim());
  const isTrueFalse = draft.kind === "true-false";
  const hasRightChoices = isTrueFalse
    ? texts.length === 2 && texts.map((t) => t.toLowerCase()).sort().join() === "false,true"
    : texts.length === CHOICES_PER_QUESTION;
  if (!hasRightChoices) return isTrueFalse ? "a true/false question needs exactly the choices True and False" : `needs exactly ${CHOICES_PER_QUESTION} choices`;
  const right = choices.filter((c) => c.correct === true);
  if (right.length !== 1) return "needs exactly one right answer";
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) return "two choices are the same";
  if (texts.some((t) => CATCH_ALL.test(t))) return "uses an all/none-of-the-above choice";
  if (!isTrueFalse) {
    const rightLength = (right[0].text as string).trim().length;
    const others = texts.filter((t) => t !== (right[0].text as string).trim()).map((t) => t.length);
    const average = others.reduce((sum, n) => sum + n, 0) / others.length;
    const isGiveaway = rightLength > GIVEAWAY_RATIO * average && rightLength - average >= GIVEAWAY_CHARS && rightLength > Math.max(...others);
    if (isGiveaway) return "the right answer is much longer than the others, which gives it away";
  }
  const written = [draft.question, ...choices.flatMap((c) => [c.text, c.why])].join("\n");
  if (checkCitations(written, pages, notes).some((c) => c.status !== "ok")) return "quotes words that aren't in the book or the notes, or cites the wrong page";
}

// Multiple-choice options in a random order, so the right one isn't always where the model put it.
// True/false keeps True first.
export function shuffleChoices(question: QuizQuestion, random = Math.random): QuizQuestion {
  if (question.kind === "true-false") {
    const trueFirst = [...question.choices].sort((a, b) => (a.text.toLowerCase() === "true" ? -1 : b.text.toLowerCase() === "true" ? 1 : 0));
    return { ...question, choices: trueFirst, answer: trueFirst.indexOf(question.choices[question.answer]) };
  }
  const order = question.choices.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...question, choices: order.map((i) => question.choices[i]), answer: order.indexOf(question.answer) };
}

// ---- Taking a quiz ----
// Setup (with the agent's or the app's feedback after a refused Start), then one question at a
// time, then a review. `answers[i]`: the choice picked for question i, or null. `note`: the quiz
// is shorter than asked because some questions failed the checks.
export type QuizState =
  | { stage: "setup"; setup: QuizSetup; feedback?: string }
  | { stage: "taking"; setup: QuizSetup; questions: QuizQuestion[]; answers: (number | null)[]; current: number; note?: string }
  | { stage: "review"; setup: QuizSetup; questions: QuizQuestion[]; answers: (number | null)[]; note?: string };

export type QuizAction =
  | { type: "setup"; setup: QuizSetup } // the reader changes a choice
  | { type: "refused"; feedback: string } // Start didn't produce a quiz: why
  | { type: "started"; questions: QuizQuestion[] }
  | { type: "answer"; choice: number }
  | { type: "next" } // after answering: the next question, or the review after the last
  | { type: "finish" } // end early: review what's answered
  | { type: "new" }; // back to setup, keeping the last choices

export const freshQuiz = (): QuizState => ({ stage: "setup", setup: defaultSetup });

// Every action that doesn't fit the current stage leaves the state as it is, so a double click or
// a stale button can't skip a question or answer twice.
export function quizStep(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case "setup":
      return state.stage === "setup" ? { stage: "setup", setup: action.setup } : state;
    case "refused":
      return state.stage === "setup" ? { ...state, feedback: action.feedback } : state;
    case "started": {
      if (state.stage !== "setup" || action.questions.length === 0) return state;
      const { questions } = action;
      const isShort = questions.length < state.setup.count;
      const note = isShort ? `${questions.length} of the ${state.setup.count} questions passed our checks, so this quiz is shorter.` : undefined;
      return { stage: "taking", setup: state.setup, questions, answers: questions.map(() => null), current: 0, ...(note && { note }) };
    }
    case "answer": {
      if (state.stage !== "taking" || state.answers[state.current] !== null) return state;
      const isChoice = Number.isInteger(action.choice) && action.choice >= 0 && action.choice < state.questions[state.current].choices.length;
      if (!isChoice) return state;
      return { ...state, answers: state.answers.map((a, i) => (i === state.current ? action.choice : a)) };
    }
    case "next": {
      if (state.stage !== "taking" || state.answers[state.current] === null) return state;
      const isLast = state.current === state.questions.length - 1;
      return isLast ? toReview(state) : { ...state, current: state.current + 1 };
    }
    case "finish":
      return state.stage === "taking" ? toReview(state) : state;
    case "new":
      return { stage: "setup", setup: state.setup };
  }
}

const toReview = ({ setup, questions, answers, note }: Extract<QuizState, { stage: "taking" }>): QuizState => ({
  stage: "review",
  setup,
  questions,
  answers,
  ...(note && { note }),
});

export const quizScore = (questions: QuizQuestion[], answers: (number | null)[]) => questions.filter((q, i) => answers[i] === q.answer).length;

// A saved quiz (store): anything malformed loads as a fresh setup, never a broken quiz.
export function pickQuiz(saved: unknown): QuizState | undefined {
  if (!isRecord(saved) || !isQuizSetup(saved.setup)) return undefined;
  const setup = { ...saved.setup };
  if (saved.stage === "setup") return { stage: "setup", setup, ...(isText(saved.feedback) && { feedback: saved.feedback }) };
  const questions = Array.isArray(saved.questions) ? saved.questions : [];
  const answers = Array.isArray(saved.answers) ? saved.answers : [];
  const areQuestionsValid = questions.length > 0 && questions.every(isQuestion);
  const areAnswersValid =
    answers.length === questions.length && answers.every((a, i) => a === null || (Number.isInteger(a) && a >= 0 && a < questions[i].choices.length));
  if (!areQuestionsValid || !areAnswersValid) return undefined;
  const note = isText(saved.note) ? { note: saved.note } : {};
  if (saved.stage === "review") return { stage: "review", setup, questions, answers, ...note };
  const isCurrentValid = Number.isInteger(saved.current) && (saved.current as number) >= 0 && (saved.current as number) < questions.length;
  if (saved.stage !== "taking" || !isCurrentValid) return undefined;
  return { stage: "taking", setup, questions, answers, current: saved.current as number, ...note };
}

const isQuestion = (q: unknown): q is QuizQuestion =>
  isRecord(q) &&
  QUIZ_TOPIC_IDS.includes(q.topic as QuizTopic) &&
  (q.kind === "multiple-choice" || q.kind === "true-false") &&
  isText(q.question) &&
  Array.isArray(q.choices) &&
  q.choices.length >= 2 &&
  q.choices.every((c) => isRecord(c) && typeof c.text === "string" && typeof c.why === "string") &&
  Number.isInteger(q.answer) &&
  (q.answer as number) >= 0 &&
  (q.answer as number) < q.choices.length;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
