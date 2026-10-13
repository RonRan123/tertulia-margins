// Every limit on what the AI is sent and may reply, in one place (Ronith, D34): change a number
// here and the app follows. Browser-safe: the UI reads the reference cap for its messages.
// Not in code: the hosted app's overall ceiling is the monthly spend limit on its Anthropic
// Console workspace (D34, H1); H2 adds a per-account cap of $3 a day here.
export const LIMITS = {
  // What a request may send; over any of these the route refuses before a paid call.
  referenceTokens: 25_000, // the book text, estimated as characters ÷ 4: 2–3 chapters, ~5¢ a turn (D32)
  notesChars: 50_000, // ~25 pages of notes (D34)
  questionChars: 4_000, // one chat message or thread reply (D34)
  historyTurns: 40, // messages of earlier chat or thread sent with each call (D34)

  // How long a reply may run, in output tokens (thinking included).
  replyTokens: {
    chat: 16_000,
    define: 4_000,
    quiz: 8_000,
    question: 4_000, // margin reactions (D18, D20)
    pushback: 4_000,
    connection: 4_000,
    router: 1_000, // picks a reaction's kind; one word, plus Sonnet's adaptive thinking
  },
};
