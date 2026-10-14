"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  BLANK,
  DIFFICULTIES,
  isRightAnswer,
  QUESTION_KINDS,
  QUESTION_LIMITS,
  QUIZ_SOURCES,
  QUIZ_STYLES,
  QUIZ_TOPIC_IDS,
  QUIZ_TOPICS,
  quizBlocker,
  quizRisk,
  quizScore,
  quizStep,
  type Difficulty,
  type FreeAnswer,
  type QuizAction,
  type QuizAnswer,
  type QuizQuestion,
  type QuizSetup,
  type QuizState,
  type QuestionKind,
  type QuizTopic,
  type Verdict,
} from "@/core/quiz.ts";
import { LIMITS } from "@/core/limits.ts";
import { gradeAnswer, makeQuiz } from "@/lib/converse-client.ts";
import { CitedText } from "./CitedText";

// The Quiz view (D42, D44): choose topics, a number of questions, a difficulty and a style; Start
// asks the quiz agent (or says at once why it can't); then one question at a time with the score so
// far, explanations after each answer, and a review at the end. A free response is graded by its
// own call. The quiz state lives in the page (saved with the book); core/quiz decides every
// transition, so a stray click can't skip ahead or answer twice.
type QuizProps = {
  bookId: string; // a quiz being written or graded for another book is abandoned when the book changes
  quiz: QuizState;
  setQuiz: Dispatch<SetStateAction<QuizState>>;
  reference: string;
  notes: string;
  aiBlock?: string; // why the AI can't be asked now (no reference text, over the cap, the day's replies)
  onAsked: () => void; // a quiz or a grading used one of the day's replies
};

const LETTERS = "ABCDE";
const VERDICT_LABELS: Record<Verdict, string> = { right: "Right", partial: "Partly right", wrong: "Wrong" };
const ERRORS: Record<string, string> = {
  daily_limit: `You've used today's ${LIMITS.dailyReplies} AI replies; they reset at midnight.`,
  rate_limited: "Claude is busy right now. Try again in a minute.",
  overloaded: "Claude is busy right now. Try again in a minute.",
  network_error: "Couldn't reach Claude. Check your connection and try again.",
};
const errorText = (code: string, what: string) => ERRORS[code] ?? `${what} (${code}). Try again.`;

export function Quiz({ bookId, quiz, setQuiz, reference, notes, aiBlock, onAsked }: QuizProps) {
  const [isMaking, setIsMaking] = useState(false);
  const [isReady, setIsReady] = useState(false); // the quiz is in: the bar finishes, then "Ready"
  const making = useRef<AbortController>(undefined);
  // The free response being graded (its question's index), and the last grading's failure.
  const [grading, setGrading] = useState<number>();
  const [gradeError, setGradeError] = useState<{ index: number; message: string }>();
  const gradingCall = useRef<AbortController>(undefined);
  const step = (action: QuizAction) => setQuiz((q) => quizStep(q, action));

  // A new book: abandon a quiz being written, or an answer being graded, for the last one.
  useEffect(
    () => () => {
      making.current?.abort();
      making.current = undefined;
      gradingCall.current?.abort();
      gradingCall.current = undefined;
      setIsMaking(false);
      setIsReady(false);
      setGrading(undefined);
      setGradeError(undefined);
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
    // The book's recent questions go along so the agent doesn't repeat them (variety).
    const result = await makeQuiz({ passage: reference, notes, question: "", quiz: { ...setup, avoid: quiz.asked ?? [] } }, abort.signal);
    if (abort.signal.aborted) return; // cancelled, or the book changed: the cleanup reset the flags
    onAsked();
    if ("error" in result || result.verdict === "insufficient") {
      making.current = undefined;
      setIsMaking(false);
      return step({ type: "refused", feedback: "error" in result ? errorText(result.error, "The quiz couldn't be written") : result.feedback });
    }
    // Let the bar run to the end and say "Ready" before the first question (Ronith): a quiz that
    // appears mid-bar leaves the wait unfinished.
    setIsReady(true);
    await new Promise((resolve) => setTimeout(resolve, READY_MS.fill + READY_MS.ready));
    if (abort.signal.aborted) return;
    making.current = undefined;
    setIsMaking(false);
    setIsReady(false);
    step({ type: "started", questions: result.questions });
  }

  function cancel() {
    making.current?.abort();
    making.current = undefined;
    setIsMaking(false);
    setIsReady(false);
  }

  // Grades question `index`'s free response `text` (D44); a failure can be retried or skipped.
  async function grade(index: number, question: QuizQuestion, text: string) {
    if (gradingCall.current || question.kind !== "free-response") return;
    const abort = new AbortController();
    gradingCall.current = abort;
    setGrading(index);
    setGradeError(undefined);
    const { modelAnswer, keyPoints } = question;
    const result = await gradeAnswer({ passage: reference, question: "", grade: { question: question.question, modelAnswer, keyPoints, answer: text } }, abort.signal);
    if (abort.signal.aborted) return;
    gradingCall.current = undefined;
    setGrading(undefined);
    onAsked();
    if ("error" in result) return setGradeError({ index, message: errorText(result.error, "Couldn't grade your answer") });
    step({ type: "graded", index, verdict: result.verdict, feedback: result.feedback });
  }

  if (quiz.stage === "setup") return <QuizSetupForm quiz={quiz} isMaking={isMaking} isReady={isReady} onChange={(setup) => step({ type: "setup", setup })} onStart={start} onCancel={cancel} />;
  if (quiz.stage === "taking") {
    const { current, questions } = quiz;
    return (
      <QuizQuestionView
        key={current} // a new question starts with empty drafts
        quiz={quiz}
        step={step}
        isGrading={grading === current}
        gradeError={gradeError?.index === current ? gradeError.message : undefined}
        onSubmitFree={(text) => {
          step({ type: "answer", answer: { text } });
          void grade(current, questions[current], text.trim());
        }}
        onRegrade={(text) => void grade(current, questions[current], text)}
      />
    );
  }
  return <QuizReview quiz={quiz} onNew={() => step({ type: "new" })} />;
}

function QuizSetupForm({
  quiz,
  isMaking,
  isReady,
  onChange,
  onStart,
  onCancel,
}: {
  quiz: Extract<QuizState, { stage: "setup" }>;
  isMaking: boolean;
  isReady: boolean;
  onChange: (setup: QuizSetup) => void;
  onStart: (setup: QuizSetup) => void;
  onCancel: () => void;
}) {
  const { setup, feedback } = quiz;
  const toggleTopic = (topic: QuizTopic, isOn: boolean) =>
    onChange({ ...setup, topics: isOn ? QUIZ_TOPIC_IDS.filter((t) => t === topic || setup.topics.includes(t)) : setup.topics.filter((t) => t !== topic) });
  const toggleStyle = (kind: QuestionKind, isOn: boolean) =>
    onChange({ ...setup, styles: isOn ? QUESTION_KINDS.filter((k) => k === kind || setup.styles.includes(k)) : setup.styles.filter((k) => k !== kind) });
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
      {quizRisk(setup) && (
        <p className="quiz-risk" role="note">
          {quizRisk(setup)}
        </p>
      )}
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
      <fieldset disabled={isMaking} className="quiz-styles">
        <legend>Style</legend>
        {QUESTION_KINDS.map((kind) => (
          <label key={kind} className="quiz-check">
            <input type="checkbox" checked={setup.styles.includes(kind)} onChange={(e) => toggleStyle(kind, e.target.checked)} />
            <span className="quiz-topic-label">{QUIZ_STYLES[kind].label}</span>
          </label>
        ))}
      </fieldset>
      {feedback && !isMaking && (
        <p className="quiz-feedback" role="alert">
          {feedback}
        </p>
      )}
      <div className="quiz-actions">
        <button type="submit" className="primary" disabled={isMaking}>
          {isReady ? "Starting…" : isMaking ? "Writing your quiz…" : "Start quiz"}
        </button>
        {isMaking && !isReady && (
          <button type="button" className="quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      {isMaking && <QuizProgress count={setup.count} isDone={isReady} />}
    </form>
  );
}

// Writing a quiz is one call with no progress of its own to report, so the bar follows the time a
// quiz of this size usually takes (measured: ~5 s plus ~3.5 s a question), easing toward 95% and
// never claiming to be done; the stage line says what the agent is doing at that point.
const QUIZ_MS = { base: 5_000, perQuestion: 3_500 };
// Once the quiz is in: the bar fills to the end, then "✓ Ready" shows, then the first question.
const READY_MS = { fill: 1_000, ready: 700 };

function QuizProgress({ count, isDone }: { count: number; isDone: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - start), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!isDone) return;
    const timer = setTimeout(() => setIsFull(true), READY_MS.fill);
    return () => clearTimeout(timer);
  }, [isDone]);
  const expected = QUIZ_MS.base + QUIZ_MS.perQuestion * count;
  const share = 0.95 * (1 - Math.exp((-2.5 * elapsed) / expected));
  const stage = share < 0.2 ? "Reading the book…" : share < 0.75 ? `Writing ${count} question${count === 1 ? "" : "s"}…` : elapsed < expected * 1.6 ? "Checking the answers…" : "Almost there: a long quiz takes a little longer…";
  const percent = isDone ? 100 : Math.round(share * 100);
  return (
    <div className="quiz-loading" aria-live="polite">
      <div className="quiz-bar" role="progressbar" aria-label="Writing your quiz" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className={isDone ? "quiz-bar-fill done" : "quiz-bar-fill"} style={{ width: `${percent}%`, transitionDuration: isDone ? `${READY_MS.fill}ms` : undefined }} />
      </div>
      {isFull ? <p className="quiz-ready">✓ Ready</p> : <p className="quiz-hint">{isDone ? "Finishing up…" : stage}</p>}
    </div>
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

type QuestionViewProps = {
  quiz: Extract<QuizState, { stage: "taking" }>;
  step: (action: QuizAction) => void;
  isGrading: boolean;
  gradeError?: string;
  onSubmitFree: (text: string) => void;
  onRegrade: (text: string) => void;
};

function QuizQuestionView({ quiz, step, isGrading, gradeError, onSubmitFree, onRegrade }: QuestionViewProps) {
  const { questions, answers, current, note } = quiz;
  const question = questions[current];
  const answer = answers[current];
  const isAnswered = answer !== null;
  const isLast = current === questions.length - 1;
  const isFree = question.kind === "free-response";
  const isGraded = isFree && isAnswered && (answer as FreeAnswer).verdict !== undefined;
  const result = !isAnswered || (isFree && !isGraded) ? undefined : isRightAnswer(question, answer) ? "right" : "wrong";
  return (
    <div className="quiz quiz-taking">
      <div className="quiz-progress">
        <span>
          Question {current + 1} of {questions.length}
        </span>
        <span className="quiz-score">
          Score {quizScore(questions, answers)}/{questions.length}
        </span>
        <button type="button" className="quiet link" onClick={() => step({ type: "finish" })} disabled={isGrading}>
          End quiz
        </button>
      </div>
      {note && current === 0 && <p className="quiz-hint">{note}</p>}
      <p className="quiz-topic">{QUIZ_TOPICS[question.topic].label}</p>
      {question.kind === "fill-blanks" ? (
        <BlanksQuestion question={question} answer={answer as number[] | null} onCheck={(picks) => step({ type: "answer", answer: picks })} />
      ) : (
        <h2 className="quiz-question">
          <CitedText text={question.question} />
        </h2>
      )}
      {(question.kind === "multiple-choice" || question.kind === "true-false") && (
        <ChoiceList question={question} picked={answer as number | null} onPick={(choice) => step({ type: "answer", answer: choice })} />
      )}
      {question.kind === "free-response" && (
        <FreeQuestion question={question} answer={answer as FreeAnswer | null} isGrading={isGrading} gradeError={gradeError} onSubmit={onSubmitFree} onRegrade={onRegrade} />
      )}
      <div className="quiz-actions" aria-live="polite">
        {result && !isFree && <p className={`quiz-result ${result}`}>{result === "right" ? "Correct." : "Not quite."}</p>}
        {isAnswered && !isGrading && (
          <button type="button" className={isFree && !isGraded ? "quiet" : "primary"} onClick={() => step({ type: "next" })}>
            {isFree && !isGraded ? "Skip grading" : isLast ? "See results" : "Next question"}
          </button>
        )}
      </div>
    </div>
  );
}

// Multiple choice and true/false: a choice locks the question, then every choice shows why.
function ChoiceList({ question, picked, onPick }: { question: Extract<QuizQuestion, { choices: unknown }>; picked: number | null; onPick: (choice: number) => void }) {
  const isAnswered = picked !== null;
  return (
    <ol className="quiz-choices">
      {question.choices.map((choice, i) => {
        const isRight = i === question.answer;
        const isPicked = i === picked;
        const mark = !isAnswered ? "" : isRight ? "right" : isPicked ? "wrong" : "other";
        return (
          <li key={i} className={`quiz-choice ${mark}`}>
            <button type="button" disabled={isAnswered} aria-pressed={isPicked} onClick={() => onPick(i)}>
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
  );
}

// Fill in the blanks (D44): the sentence with a dropdown in each gap; Check locks them all, then
// each blank shows why the option chosen does or doesn't belong, and the right one if it doesn't.
function BlanksQuestion({ question, answer, onCheck }: { question: Extract<QuizQuestion, { kind: "fill-blanks" }>; answer: number[] | null; onCheck: (picks: number[]) => void }) {
  const [draft, setDraft] = useState<(number | undefined)[]>(() => question.blanks.map(() => undefined));
  const picks = answer ?? draft;
  const isAnswered = answer !== null;
  const isComplete = draft.every((p) => p !== undefined);
  const parts = question.question.split(BLANK);
  return (
    <>
      <h2 className="quiz-question quiz-blanks">
        {parts.map((part, i) => (
          <span key={i}>
            <CitedText text={part} />
            {i < question.blanks.length && (
              <select
                aria-label={`Blank ${i + 1}`}
                className={!isAnswered ? "" : picks[i] === question.blanks[i].answer ? "right" : "wrong"}
                value={picks[i] ?? ""}
                disabled={isAnswered}
                onChange={(e) => setDraft((d) => d.map((p, j) => (j === i ? Number(e.target.value) : p)))}
              >
                <option value="" disabled>
                  choose…
                </option>
                {question.blanks[i].choices.map((c, j) => (
                  <option key={j} value={j}>
                    {c.text}
                  </option>
                ))}
              </select>
            )}
          </span>
        ))}
      </h2>
      {!isAnswered && (
        <div className="quiz-actions">
          <button type="button" className="primary" disabled={!isComplete} onClick={() => onCheck(draft as number[])}>
            Check answers
          </button>
        </div>
      )}
      {isAnswered && <BlankExplanations question={question} picks={answer} />}
    </>
  );
}

function BlankExplanations({ question, picks }: { question: Extract<QuizQuestion, { kind: "fill-blanks" }>; picks: number[] }) {
  return (
    <ol className="quiz-blank-whys">
      {question.blanks.map((blank, i) => {
        const chosen = blank.choices[picks[i]];
        const isRight = picks[i] === blank.answer;
        const right = blank.choices[blank.answer];
        return (
          <li key={i} className={isRight ? "right" : "wrong"}>
            <p>
              <strong>
                Blank {i + 1}: {chosen.text}
              </strong>{" "}
              <span className="verdict">{isRight ? "right" : "wrong"}</span> — <CitedText text={chosen.why} />
            </p>
            {!isRight && (
              <p>
                <strong>Right answer: {right.text}</strong> — <CitedText text={right.why} />
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Free response (D44): write, submit (locked), then the grader's verdict and one line, then the
// model answer and key points. A failed grading can be tried again, or skipped.
function FreeQuestion({
  question,
  answer,
  isGrading,
  gradeError,
  onSubmit,
  onRegrade,
}: {
  question: Extract<QuizQuestion, { kind: "free-response" }>;
  answer: FreeAnswer | null;
  isGrading: boolean;
  gradeError?: string;
  onSubmit: (text: string) => void;
  onRegrade: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  if (answer === null)
    return (
      <form
        className="quiz-free"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) onSubmit(draft);
        }}
      >
        <textarea aria-label="Your answer" rows={4} value={draft} maxLength={2000} placeholder="Answer in a sentence or two." onChange={(e) => setDraft(e.target.value)} />
        <div className="quiz-actions">
          <button type="submit" className="primary" disabled={!draft.trim()}>
            Submit answer
          </button>
        </div>
      </form>
    );
  return (
    <div className="quiz-free">
      <blockquote className="quiz-your-answer">{answer.text}</blockquote>
      {isGrading && <p className="quiz-hint">Grading your answer…</p>}
      {!isGrading && answer.verdict === undefined && (
        <div className="quiz-actions">
          {gradeError && <p className="quiz-feedback">{gradeError}</p>}
          <button type="button" className="primary" onClick={() => onRegrade(answer.text)}>
            {gradeError ? "Try grading again" : "Grade my answer"}
          </button>
        </div>
      )}
      {answer.verdict && (
        <>
          <p className={`quiz-grade ${answer.verdict}`}>
            <strong>{VERDICT_LABELS[answer.verdict]}.</strong> {answer.feedback}
          </p>
          <ModelAnswer question={question} />
        </>
      )}
    </div>
  );
}

function ModelAnswer({ question }: { question: Extract<QuizQuestion, { kind: "free-response" }> }) {
  return (
    <div className="quiz-model">
      <p>
        <strong>A full answer:</strong> <CitedText text={question.modelAnswer} />
      </p>
      <ul>
        {question.keyPoints.map((point, i) => (
          <li key={i}>
            <CitedText text={point} />
          </li>
        ))}
      </ul>
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
          <ReviewItem key={i} question={q} answer={answers[i]} number={i + 1} />
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

function ReviewItem({ question, answer, number }: { question: QuizQuestion; answer: QuizAnswer; number: number }) {
  const isRight = isRightAnswer(question, answer);
  const heading = (
    <p className="review-question">
      <span className="review-mark" aria-label={isRight ? "Right" : "Wrong"}>
        {isRight ? "✓" : "✗"}
      </span>{" "}
      {number}. <CitedText text={question.kind === "fill-blanks" ? question.question.replaceAll(BLANK, "____") : question.question} />
    </p>
  );
  const unanswered = answer === null && <p className="quiz-hint">Not answered.</p>;
  if (question.kind === "fill-blanks")
    return (
      <li className={isRight ? "review-item right" : "review-item wrong"}>
        {heading}
        {unanswered || <BlankExplanations question={question} picks={answer as number[]} />}
      </li>
    );
  if (question.kind === "free-response") {
    const free = answer as FreeAnswer | null;
    return (
      <li className={isRight ? "review-item right" : "review-item wrong"}>
        {heading}
        {unanswered}
        {free && (
          <p>
            <strong>Your answer:</strong> {free.text}
          </p>
        )}
        {free?.verdict ? (
          <p className={`quiz-grade ${free.verdict}`}>
            <strong>{VERDICT_LABELS[free.verdict]}.</strong> {free.feedback}
          </p>
        ) : (
          free && <p className="quiz-hint">Not graded.</p>
        )}
        <ModelAnswer question={question} />
      </li>
    );
  }
  const right = question.choices[question.answer];
  const yours = typeof answer === "number" ? question.choices[answer] : undefined;
  return (
    <li className={isRight ? "review-item right" : "review-item wrong"}>
      {heading}
      {yours && !isRight && (
        <p>
          <strong>Your answer:</strong> <CitedText text={yours.text} /> — <CitedText text={yours.why} />
        </p>
      )}
      {unanswered}
      <p>
        <strong>{isRight ? "Your answer, right:" : "Right answer:"}</strong> <CitedText text={right.text} /> — <CitedText text={right.why} />
      </p>
    </li>
  );
}
