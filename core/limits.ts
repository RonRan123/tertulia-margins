// Every limit on what the AI is sent and may reply, in one place (Ronith, D34): change a number
// here and the app follows. Browser-safe: the UI reads the reference cap for its messages.
// Not in code: the hosted app's overall ceiling is the monthly spend limit on its Anthropic
// Console workspace (D34, H1).
export const LIMITS = {
  // What a request may send; over any of these the route refuses before a paid call.
  referenceTokens: 50_000, // the book text, estimated as characters ÷ 4: ~50 dense pages (more for lighter ones), ~10¢ a turn (D32)
  notesChars: 50_000, // ~25 pages of notes (D34)
  questionChars: 4_000, // one chat message or thread reply (D34)
  historyTurns: 40, // messages of earlier chat or thread sent with each call (D34)

  // AI replies (chat, React, thread replies) one browser may ask for per local day; then the AI
  // pauses until midnight. Counted in localStorage, so it guards honest overuse, not abuse (D35).
  dailyReplies: 60,

  // Daemons (D37): when they look at the notes, and how often they may per day. A run starts once
  // the reader pauses for `idleMs` with at least `minLines` lines of their own words new or changed;
  // after `floorLines` lines with no card, the reviewer must show one. Counted per browser per local
  // day, apart from dailyReplies; at the cap daemons pause quietly and chat keeps working.
  daemons: {
    idleMs: 25_000,
    minLines: 10,
    maxCardsPerRun: 3, // D51: a run may show several cards, each on a different line, none repeating the margin
    sectionLines: 12, // D53: "React to notes" reads the notes in sections of about this many of the reader's own lines,
    maxSections: 4, //   one panel call each, at once; a press reads at most this many (the most recent)
    floorLines: 15,
    poolSize: 6, // runners-up kept per book, to fill the floor without a call
    dailyRuns: 40,
  },

  // How long a reply may run, in output tokens (thinking included).
  replyTokens: {
    chat: 16_000,
    define: 4_000,
    quiz: 16_000, // a quiz (D42): up to 10 questions with an explanation per choice, as JSON, plus thinking
    grade: 2_000, // a free response's grade (D44): a verdict and one line, as JSON, plus thinking
    panel: 6_000, // a daemon run (D37): every daemon's nugget (≤40 words each) as JSON, plus thinking
    reviewer: 2_000, // picks one nugget or none; one word of JSON, plus thinking
  },
};
