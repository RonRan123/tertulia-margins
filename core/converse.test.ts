import { expect, test } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { COMMANDS } from "./commands.ts";
import { LIMITS } from "./limits.ts";
import { buildContext, converse, errorCode, groundedNuggets, parseConverseRequest, reviewerTurn, type ConverseRequest } from "./converse.ts";

const valid = { passage: "One.\n\nTwo.", question: "Why?" };
const errorOf = (body: unknown) => {
  const parsed = parseConverseRequest(body);
  return "error" in parsed ? parsed.error : undefined;
};

test("a valid body parses, keeping only known fields", () => {
  const body = { ...valid, history: [{ role: "user", content: "Hi", extra: 1 }], book: { title: "T", isbn: "x" } };
  expect(parseConverseRequest(body)).toEqual({
    ...valid,
    history: [{ role: "user", content: "Hi" }],
    book: { title: "T", author: undefined, edition: undefined },
  });
});

test("a non-object body is body_invalid", () => {
  for (const body of [null, "text", 3, [valid]]) expect(errorOf(body)).toBe("body_invalid");
});

test("missing or blank passage and question", () => {
  expect(errorOf({ question: "Why?" })).toBe("passage_missing");
  expect(errorOf({ ...valid, passage: 42 })).toBe("passage_missing");
  expect(errorOf({ ...valid, question: "  " })).toBe("question_missing");
});

test("a passage of only page markers is passage_empty", () => {
  expect(errorOf({ ...valid, passage: "[p. 7]\n\n[PDF p. 8]" })).toBe("passage_empty");
});

test("history must be an array of user/assistant turns with text", () => {
  expect(errorOf({ ...valid, history: "hi" })).toBe("history_invalid");
  expect(errorOf({ ...valid, history: null })).toBe("history_invalid");
  expect(errorOf({ ...valid, history: [{ role: "system", content: "x" }] })).toBe("history_invalid");
  expect(errorOf({ ...valid, history: [{ role: "user", content: "" }] })).toBe("history_invalid");
  expect(errorOf({ ...valid, history: [] })).toBeUndefined();
});

test("notes must be a string when present", () => {
  expect(errorOf({ ...valid, notes: 42 })).toBe("notes_invalid");
  expect(errorOf({ ...valid, notes: null })).toBe("notes_invalid");
  expect(errorOf({ ...valid, notes: "" })).toBeUndefined();
  expect(parseConverseRequest({ ...valid, notes: "Mine" })).toMatchObject({ notes: "Mine" });
});

test("oversized notes, question or history are refused before any paid call (D34)", () => {
  const turn = { role: "user", content: "Hi" };
  expect(errorOf({ ...valid, notes: "x".repeat(50_001) })).toBe("notes_too_long");
  expect(errorOf({ ...valid, question: "x".repeat(4_001) })).toBe("question_too_long");
  expect(errorOf({ ...valid, history: Array(41).fill(turn) })).toBe("history_too_long");
  expect(errorOf({ ...valid, notes: "x".repeat(50_000), question: "x".repeat(4_000), history: Array(40).fill(turn) })).toBeUndefined();
});

test("context is ordered stable to volatile: book, system prompt, notes, history, question (D38)", () => {
  const history = [{ role: "user" as const, content: "Q1" }, { role: "assistant" as const, content: "A1" }];
  const { system, messages, pages } = buildContext({ ...valid, notes: "  My note  \n", history });
  expect(system).toHaveLength(3);
  expect(system[0].text).toBe("<book_text>\nOne.\n\nTwo.\n</book_text>");
  expect(system[1].text).toContain("<grounding_rules>");
  expect(system[2].text).toBe("<notes>\nMy note\n</notes>");
  expect(messages).toEqual([...history, { role: "user", content: "Why?" }]);
  expect(pages).toEqual([{ text: "One.\n\nTwo." }]);
  const paged = buildContext({ ...valid, passage: "[p. 7] One.\n\n[PDF p. 8]\nTwo." });
  expect(paged.system[0].text).toBe('<book_text>\n<page n="7">\nOne.\n</page>\n\n<page n="8">\nTwo.\n</page>\n</book_text>');
});

test("blank or missing notes add no notes block", () => {
  for (const notes of [undefined, "", " \n "]) expect(buildContext({ ...valid, notes }).system).toHaveLength(2);
});

test("book must be an object with optional string fields", () => {
  expect(errorOf({ ...valid, book: "Emma" })).toBe("book_invalid");
  expect(errorOf({ ...valid, book: { title: 3 } })).toBe("book_invalid");
  expect(errorOf({ ...valid, book: {} })).toBeUndefined();
});

test("command must be a known name with a string selection; /define needs a selection", () => {
  expect(errorOf({ ...valid, command: "define" })).toBe("command_invalid");
  expect(errorOf({ ...valid, command: { name: "define" } })).toBe("command_invalid");
  expect(errorOf({ ...valid, command: { name: "expand", selection: "x" } })).toBe("command_unknown");
  expect(errorOf({ ...valid, command: { name: "toString", selection: "x" } })).toBe("command_unknown");
  expect(errorOf({ ...valid, command: { name: "define", selection: " " } })).toBe("selection_missing");
  expect(errorOf({ ...valid, command: { name: "quiz", selection: "" } })).toBeUndefined();
  const body = { ...valid, command: { name: "define", selection: "levity", extra: 1 } };
  expect(parseConverseRequest(body)).toMatchObject({ command: { name: "define", selection: "levity" } });
  expect(parseConverseRequest(body)).not.toHaveProperty("command.extra");
  expect(parseConverseRequest(valid)).not.toHaveProperty("command");
});

test("a command's prompt goes in the last user turn; system blocks and history are unchanged", () => {
  const history = [{ role: "user" as const, content: "/quiz" }, { role: "assistant" as const, content: "A1" }];
  const chat = buildContext({ ...valid, notes: "Mine", history });
  const define = buildContext({ ...valid, notes: "Mine", history, question: "/define levity", command: { name: "define", selection: "levity" } });
  expect(define.system).toEqual(chat.system);
  expect(chat.system[0].text).not.toContain("define <word>");
  expect(define.messages.slice(0, -1)).toEqual(history);
  const turn = define.messages.at(-1)!.content;
  expect(turn).toMatch(/^<command>\nIf the user types "define <word>"[^]*<\/command>\n\n<selection>\nlevity\n<\/selection>\n\n\/define levity$/);
  expect(turn).not.toContain("OWNER");
  expect(define.maxTokens).toBe(COMMANDS.define.maxTokens);
  expect(chat.maxTokens).toBe(16000);

  const quiz = buildContext({ ...valid, question: "/quiz", command: { name: "quiz", selection: "" } });
  expect(quiz.messages.at(-1)!.content).toMatch(/^<command>\nIf "quiz"[^]*<\/command>\n\n\/quiz$/);
});

test("a mid-stream overloaded error (no HTTP status) maps to overloaded", () => {
  const midStream = new Anthropic.APIError(undefined, { type: "error" }, "Overloaded", undefined, "overloaded_error");
  expect(errorCode(midStream)).toBe("overloaded");
  expect(errorCode(new Anthropic.APIError(undefined, {}, "boom", undefined, "api_error"))).toBe("api_error");
});

// A fake client stands in for the API: no network in tests. It streams `reply` as one delta.
function fakeClient(reply = "Why “the sky fell” [p. 1]?") {
  const calls: unknown[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: unknown) => {
          calls.push(params);
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "content_block_delta", delta: { type: "text_delta", text: reply } };
            },
            finalMessage: async () => ({ model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: {} }),
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

async function run(request: ConverseRequest, client: Anthropic) {
  const events = [];
  const reply = converse(request, undefined, client);
  let step = await reply.next();
  while (!step.done) {
    events.push(step.value);
    step = await reply.next();
  }
  return { events, stats: step.value };
}

test("chat streams its text, then the citations are checked against the pages", async () => {
  const { client, calls } = fakeClient();
  const { events, stats } = await run({ ...valid, passage: "[p. 1] The sky was blue." }, client);
  expect(events).toEqual([{ type: "text", text: "Why “the sky fell” [p. 1]?" }]);
  expect(calls).toHaveLength(1);
  expect(stats.citations).toEqual([{ quote: "the sky fell", pages: ["1"], status: "quote_not_on_page" }]);
});

test("a reference text over the D32 cap is refused before any call", () => {
  const passage = "[p. 1] " + "word ".repeat(LIMITS.referenceTokens); // 5 characters a word: over the cap
  expect(parseConverseRequest({ passage, question: "Why?" })).toEqual({ error: "reference_too_long" });
});

// ---- Daemons (D37) ----
// A fake client for a daemon run: each create() returns the next JSON answer (panel, then reviewer).
function daemonClient(...answers: unknown[]) {
  const calls: unknown[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: unknown) => {
          calls.push(params);
          const text = JSON.stringify(answers[calls.length - 1]);
          return { model: "claude-sonnet-5-5", stop_reason: "end_turn", usage: { input_tokens: calls.length }, content: [{ type: "text", text }] };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}
const book = { passage: "[p. 1] The sky fell on Tuesday.\n\n[p. 2] Nobody minded the sky.", notes: "- Everyone panicked.\n- Tuesday matters." };
const bookPages = [{ page: "1", text: "The sky fell on Tuesday." }, { page: "2", text: "Nobody minded the sky." }];
const daemonRun = { ...book, question: "", daemons: { excerpt: "- Everyone panicked.\n- Tuesday matters." } };
const draft = (daemon: string, nugget: string, anchor = "Everyone panicked") => ({ daemon, pass: false, nugget, anchor });
const pass = (daemon: string) => ({ daemon, pass: true, nugget: "", anchor: "" });

test("daemon run validation: shape, excerpt, mustPick, and nothing else alongside", () => {
  expect(parseConverseRequest({ passage: book.passage, daemons: { excerpt: "Mine", extra: 1 } })).toEqual({
    passage: book.passage, question: "", notes: undefined, history: [], book: undefined, daemons: { excerpt: "Mine", mustPick: false },
  });
  expect(parseConverseRequest({ ...valid, daemons: { excerpt: "Mine", mustPick: true } })).toMatchObject({ daemons: { mustPick: true } });
  expect(errorOf({ ...valid, daemons: "Mine" })).toBe("daemons_invalid");
  expect(errorOf({ ...valid, daemons: { excerpt: "Mine", mustPick: "yes" } })).toBe("daemons_invalid");
  expect(errorOf({ ...valid, daemons: { excerpt: " " } })).toBe("excerpt_missing");
  expect(errorOf({ ...valid, daemons: { excerpt: "Mine" }, command: { name: "quiz", selection: "" } })).toBe("request_conflict");
});

test("the panel call shares chat's book and notes but has its own role; its turn holds each daemon, then the excerpt", async () => {
  const { client, calls } = daemonClient({ drafts: [pass("author"), pass("devils-advocate")] });
  await run(daemonRun, client);
  const panel = calls[0] as { system: { text: string }[]; messages: { content: string }[]; output_config: { format: { type: string } } };
  const chat = buildContext({ ...book, question: "x" }).system;
  expect(panel.system[0]).toEqual(chat[0]); // the book: the shared prefix
  expect(panel.system[1].text).toMatch(/^<role>\nYou voice a small panel[^]*Think the excerpt through before you answer[^]*$/);
  expect(panel.system[2]).toEqual(chat[2]); // the notes
  expect(panel.output_config.format.type).toBe("json_schema");
  const turn = panel.messages[0].content;
  expect(turn).toMatch(/^<daemons>\n<daemon id="author" name="The Author">\n<action>\nConnect [^]*<persona>\nVoice:[^]*<daemon id="devils-advocate"[^]*<action>\nCounter [^]*<\/daemons>\n\n<excerpt>\n- Everyone panicked\.\n- Tuesday matters\.\n<\/excerpt>$/);
  expect(turn + panel.system[1].text).not.toContain("DRAFTED BY CLAUDE");
});

test("grounding: passes, unknown and repeated daemons, and invented quotes are dropped; a stray anchor falls back", () => {
  const output = {
    drafts: [
      draft("author", "As I wrote, “nobody minded the sky” [p. 2].", "Tuesday matters"),
      draft("author", "A second author draft."),
      draft("devils-advocate", "Where does “everyone ran screaming home” come from [p. 1]?"),
      draft("narrator", "Not a daemon."),
      pass("devils-advocate"),
    ],
  };
  expect(groundedNuggets(output, bookPages, book.notes, daemonRun.daemons.excerpt)).toEqual([
    { daemon: "author", text: "As I wrote, “nobody minded the sky” [p. 2].", anchor: "Tuesday matters" },
  ]);
  // Quoting the reader's own note is fine (D38); a stray anchor falls back to the excerpt's first line.
  const stray = groundedNuggets({ drafts: [draft("devils-advocate", "You say “Everyone panicked” but did they?", "not in the notes")] }, bookPages, book.notes, " - Everyone panicked.\n- x");
  expect(stray).toEqual([{ daemon: "devils-advocate", text: "You say “Everyone panicked” but did they?", anchor: "- Everyone panicked." }]);
  expect(groundedNuggets(undefined, bookPages, "", "x")).toEqual([]);
});

test("all pass: no reviewer call, nothing picked", async () => {
  const { client, calls } = daemonClient({ drafts: [pass("author"), pass("devils-advocate")] });
  const { events, stats } = await run(daemonRun, client);
  expect(calls).toHaveLength(1);
  expect(events).toEqual([{ type: "daemons", pick: null, nuggets: [] }]);
  expect(stats.reviewerUsage).toBeUndefined();
});

test("two nuggets: the reviewer sees the excerpt, both, and only the pages they cite, and picks one", async () => {
  const drafts = [draft("author", "Look again at [p. 2]."), draft("devils-advocate", "Did everyone? Nobody minded [pp. 2–2].")];
  const { client, calls } = daemonClient({ drafts }, { pick: "devils-advocate" });
  const { events, stats } = await run(daemonRun, client);
  expect(calls).toHaveLength(2);
  const reviewer = calls[1] as { system: string; messages: { content: string }[]; output_config: { format: { schema: { properties: { pick: { enum: string[] } } } } } };
  expect(reviewer.system).toMatch(/^You are the editor of a reader's margin/);
  expect(reviewer.output_config.format.schema.properties.pick.enum).toEqual(["author", "devils-advocate", "none"]);
  expect(reviewer.messages[0].content).toBe(reviewerTurn(events[0].type === "daemons" ? events[0].nuggets : [], bookPages, daemonRun.daemons));
  expect(reviewer.messages[0].content).toContain('<cited>\n<page n="2">\nNobody minded the sky.\n</page>\n</cited>');
  expect(reviewer.messages[0].content).not.toContain("The sky fell on Tuesday.");
  expect(events).toEqual([{ type: "daemons", pick: "devils-advocate", nuggets: drafts.map((d) => ({ daemon: d.daemon, text: d.nugget, anchor: d.anchor })) }]);
  expect(stats.reviewerUsage).toEqual({ input_tokens: 2 });
});

test("the reviewer may show nothing, unless the run must pick", async () => {
  const drafts = [draft("author", "Look again at [p. 2]."), draft("devils-advocate", "Did everyone?")];
  const none = await run(daemonRun, daemonClient({ drafts }, { pick: "none" }).client);
  expect(none.events[0]).toMatchObject({ pick: null });

  const mustPick = { ...daemonRun, daemons: { ...daemonRun.daemons, mustPick: true } };
  const { client, calls } = daemonClient({ drafts }, { pick: "author" });
  await run(mustPick, client);
  expect((calls[1] as { output_config: { format: { schema: { properties: { pick: { enum: string[] } } } } } }).output_config.format.schema.properties.pick.enum).toEqual(["author", "devils-advocate"]);

  const single = daemonClient({ drafts: [drafts[1], pass("author")] });
  const shown = await run(mustPick, single.client);
  expect(single.calls).toHaveLength(1); // one nugget that must be shown: no reviewer call
  expect(shown.events[0]).toMatchObject({ pick: "devils-advocate" });
});
