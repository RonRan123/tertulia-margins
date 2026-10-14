"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  DIFFICULTIES,
  QUESTION_LIMITS,
  QUIZ_SOURCES,
  QUIZ_STYLES,
  QUIZ_TOPIC_IDS,
  QUIZ_TOPICS,
  quizBlocker,
  quizScore,
  quizStep,
  type Difficulty,
  type QuizAction,
  type QuizQuestion,
  type QuizSetup,
  type QuizState,
  type QuizStyle,
  type QuizTopic,
} from "@/core/quiz.ts";
import { LIMITS } from "@/core/limits.ts";
import { makeQuiz } from "@/lib/converse-client.ts";
import { CitedText } from "./CitedText";

// The Quiz view (D42): choose topics, a number of questions, a difficulty and a style; Start asks
// the quiz agent (or says at once why it can't); then one question at a time with the score so
// far, explanations after each answer, and a review at the end. The quiz state lives in the page
// (saved with the book); core/quiz decides every transition, so a stray click can't skip ahead.
type QuizProps = {
  bookId: string; // a quiz being written for another book is abandoned when the book changes
  quiz: QuizState;
  setQuiz: Dispatch<SetStateAction<QuizState>>;
  reference: string;
  notes: string;
  aiBlock?: string; // why the AI can't be asked now (no reference text, over the cap, the day's replies)
  onAsked: () => void; // a quiz used one of the day's replies
};

const LETTERS = "ABCDE";
const ERRORS: Record<string, string> = {
  daily_limit: `You've used today's ${LIMITS.dailyReplies} AI replies; they reset at midnight.`,
  rate_limited: "Claude is busy right now. Try again in a minute.",
  overloaded: "Claude is busy right now. Try again in a minute.",
  network_error: "Couldn't reach the quiz writer. Check your connection and try again.",
};

export function Quiz({ bookId, quiz, setQuiz, reference, notes, aiBlock, onAsked }: QuizProps) {
  const [isMaking, setIsMaking] = useState(false);
  const making = useRef<AbortController>(undefined);
  const step = (action: QuizAction) => setQuiz((q) => quizStep(q, action));

  // A new book: abandon a quiz being written for the last one.
  useEffect(
    () => () => {
      making.current?.abort();
      making.current = undefined;
      setIsMaking(false);
    },
    [bookId],
  );

  async function start(setup: QuizSetup) {
    if (making.current) return;
    const blocker = quizBlocker(setup, notes, aiBlock);
    if (blocker) return step({ type: "refused", feedback: blocker });
    const abort = new AbortController();
    making.current = abort;
    setIsMaking(true);
    step({ type: "setup", setup }); // clears the last feedback
    const result = await makeQuiz({ passage: reference, notes, question: "", quiz: setup }, abort.signal);
    if (abort.signal.aborted) return; // cancelled, or the book changed: the cleanup reset the flags
    making.current = undefined;
    setIsMaking(false);
    onAsked();
    if ("error" in result) return step({ type: "refused", feedback: ERRORS[result.error] ?? `The quiz couldn't be written (${result.error}). Try again.` });
    if (result.verdict === "insufficient") return step({ type: "refused", feedback: result.feedback });
    step({ type: "started", questions: result.questions });
  }

  function cancel() {
    making.current?.abort();
    making.current = undefined;
    setIsMaking(false);
  }

  if (quiz.stage === "setup") return <QuizSetupForm quiz={quiz} isMaking={isMaking} onChange={(setup) => step({ type: "setup", setup })} onStart={start} onCancel={cancel} />;
  if (quiz.stage === "taking") return <QuizQuestionView quiz={quiz} step={step} />;
  return <QuizReview quiz={quiz} onNew={() => step({ type: "new" })} />;
}

function QuizSetupForm({
  quiz,
  isMaking,
  onChange,
  onStart,
  onCancel,
}: {
  quiz: Extract<QuizState, { stage: "setup" }>;
  isMaking: boolean;
  onChange: (setup: QuizSetup) => void;
  onStart: (setup: QuizSetup) => void;
  onCancel: () => void;
}) {
  const { setup, feedback } = quiz;
  const toggleTopic = (topic: QuizTopic, isOn: boolean) =>
    onChange({ ...setup, topics: isOn ? QUIZ_TOPIC_IDS.filter((t) => t === topic || setup.topics.includes(t)) : setup.topics.filter((t) => t !== topic) });
  const counts = Array.from({ length: QUESTION_LIMITS.max - QUESTION_LIMITS.min + 1 }, (_, i) => QUESTION_LIMITS.min + i);
  return (
    <form
      className="quiz quiz-setup"
      onSubmit={(e) => {
        e.preventDefault();
        onStart(setup);
      }}
    >
      <h2>Quiz yourself</h2>
      {(Object.keys(QUIZ_SOURCES) as (keyof typeof QUIZ_SOURCES)[]).map((source) => (
        <fieldset key={source} disabled={isMaking}>
          <legend>{QUIZ_SOURCES[source]}</legend>
          {QUIZ_TOPIC_IDS.filter((topic) => QUIZ_TOPICS[topic].source === source).map((topic) => (
            <label key={topic} className="quiz-check">
              <input type="checkbox" checked={setup.topics.includes(topic)} onChange={(e) => toggleTopic(topic, e.target.checked)} />
              <span className="quiz-topic-label">{QUIZ_TOPICS[topic].label}</span>
              <span className="quiz-topic-hint">{QUIZ_TOPICS[topic].hint}</span>
            </label>
          ))}
        </fieldset>
      ))}
      <fieldset disabled={isMaking} className="quiz-row">
        <label>
          <span className="quiz-legend">Questions</span>
          <select value={setup.count} onChange={(e) => onChange({ ...setup, count: Number(e.target.value) })}>
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <Segmented
        legend="Difficulty"
        disabled={isMaking}
        options={DIFFICULTIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
        value={setup.difficulty}
        onChange={(difficulty: Difficulty) => onChange({ ...setup, difficulty })}
      />
      <Segmented
        legend="Style"
        disabled={isMaking}
        options={(Object.keys(QUIZ_STYLES) as QuizStyle[]).map((s) => ({ value: s, label: QUIZ_STYLES[s].label }))}
        value={setup.style}
        onChange={(style: QuizStyle) => onChange({ ...setup, style })}
      />
      {feedback && !isMaking && (
        <p className="quiz-feedback" role="alert">
          {feedback}
        </p>
      )}
      <div className="quiz-actions">
        <button type="submit" className="primary" disabled={isMaking}>
          {isMaking ? "Writing your quiz…" : "Start quiz"}
        </button>
        {isMaking && (
          <button type="button" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {isMaking && <p className="quiz-hint" aria-live="polite">This can take up to a minute.</p>}
    </form>
  );
}

function Segmented<T extends string>({
  legend,
  options,
  value,
  disabled,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="quiz-segmented" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="segments">
        {options.map((o) => (
          <label key={o.value} className={o.value === value ? "segment selected" : "segment"}>
            <input type="radio" name={legend} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function QuizQuestionView({ quiz, step }: { quiz: Extract<QuizState, { stage: "taking" }>; step: (action: QuizAction) => void }) {
  const { questions, answers, current, note } = quiz;
  const question = questions[current];
  const picked = answers[current];
  const isAnswered = picked !== null;
  const isLast = current === questions.length - 1;
  return (
    <div className="quiz quiz-taking">
      <div className="quiz-progress">
        <span>
          Question {current + 1} of {questions.length}
        </span>
        <span className="quiz-score">
          Score {quizScore(questions, answers)}/{questions.length}
        </span>
        <button type="button" className="quiet link" onClick={() => step({ type: "finish" })}>
          End quiz
        </button>
      </div>
      {note && current === 0 && <p className="quiz-hint">{note}</p>}
      <p className="quiz-topic">{QUIZ_TOPICS[question.topic].label}</p>
      <h2 className="quiz-question">
        <CitedText text={question.question} />
      </h2>
      <ol className="quiz-choices">
        {question.choices.map((choice, i) => {
          const isRight = i === question.answer;
          const isPicked = i === picked;
          const mark = !isAnswered ? "" : isRight ? "right" : isPicked ? "wrong" : "other";
          return (
            <li key={i} className={`quiz-choice ${mark}`}>
              <button type="button" disabled={isAnswered} aria-pressed={isPicked} onClick={() => step({ type: "answer", choice: i })}>
                <span className="letter">{question.kind === "true-false" ? "" : LETTERS[i]}</span>
                <span className="text">
                  <CitedText text={choice.text} />
                </span>
                {isAnswered && (isRight || isPicked) && <span className="verdict">{isRight ? "Right answer" : "Your answer"}</span>}
              </button>
              {isAnswered && (
                <p className="why">
                  <CitedText text={choice.why} />
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <div className="quiz-actions" aria-live="polite">
        {isAnswered && (
          <>
            <p className={picked === question.answer ? "quiz-result right" : "quiz-result wrong"}>{picked === question.answer ? "Correct." : "Not quite."}</p>
            <button type="button" className="primary" onClick={() => step({ type: "next" })}>
              {isLast ? "See results" : "Next question"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function QuizReview({ quiz, onNew }: { quiz: Extract<QuizState, { stage: "review" }>; onNew: () => void }) {
  const { questions, answers, note } = quiz;
  const answered = answers.filter((a) => a !== null).length;
  return (
    <div className="quiz quiz-review">
      <h2>
        You got {quizScore(questions, answers)} of {questions.length} right
      </h2>
      {answered < questions.length && <p className="quiz-hint">You ended the quiz after {answered} of {questions.length} questions.</p>}
      {note && <p className="quiz-hint">{note}</p>}
      <ol className="quiz-review-list">
        {questions.map((q, i) => (
          <ReviewItem key={i} question={q} picked={answers[i]} number={i + 1} />
        ))}
      </ol>
      <div className="quiz-actions">
        <button type="button" className="primary" onClick={onNew}>
          New quiz
        </button>
      </div>
    </div>
  );
}

function ReviewItem({ question, picked, number }: { question: QuizQuestion; picked: number | null; number: number }) {
  const isRight = picked === question.answer;
  const right = question.choices[question.answer];
  const yours = picked === null ? undefined : question.choices[picked];
  return (
    <li className={isRight ? "review-item right" : "review-item wrong"}>
      <p className="review-question">
        <span className="review-mark" aria-label={isRight ? "Right" : "Wrong"}>
          {isRight ? "✓" : "✗"}
        </span>{" "}
        {number}. <CitedText text={question.question} />
      </p>
      {yours && !isRight && (
        <p>
          <strong>Your answer:</strong> <CitedText text={yours.text} /> — <CitedText text={yours.why} />
        </p>
      )}
      {!yours && <p className="quiz-hint">Not answered.</p>}
      <p>
        <strong>{isRight ? "Your answer, right:" : "Right answer:"}</strong> <CitedText text={right.text} /> — <CitedText text={right.why} />
      </p>
    </li>
  );
}
