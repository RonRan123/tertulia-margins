import { expect, test } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { COMMANDS } from "./commands.ts";
import { buildContext, converse, errorCode, parseConverseRequest, routerContext, type ConverseRequest } from "./converse.ts";

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

test("context is ordered stable to volatile: system prompt, passage, notes, history, question", () => {
  const history = [{ role: "user" as const, content: "Q1" }, { role: "assistant" as const, content: "A1" }];
  const { system, messages, paragraphs } = buildContext({ ...valid, notes: "  My note  \n", history });
  expect(system).toHaveLength(3);
  expect(system[0].text).toContain("<grounding_rules>");
  expect(system[1].text).toBe("<passage>\n[¶1] One.\n\n[¶2] Two.\n</passage>");
  expect(system[2].text).toBe("<notes>\nMy note\n</notes>");
  expect(messages).toEqual([...history, { role: "user", content: "Why?" }]);
  expect(paragraphs).toEqual(["One.", "Two."]);
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

// Reactions (D18, D20). A fake client stands in for the API: no network in tests.
function fakeClient(routerAnswer: string | Error, reply = "Why “the sky fell” [¶1]?") {
  const calls = { create: [] as unknown[], stream: [] as unknown[] };
  const client = {
    beta: {
      messages: {
        create: async (params: unknown) => {
          calls.create.push(params);
          if (routerAnswer instanceof Error) throw routerAnswer;
          return { content: [{ type: "text", text: routerAnswer }] };
        },
        stream: (params: unknown) => {
          calls.stream.push(params);
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

const firstReaction = { ...valid, question: "", notes: "Mine", reaction: { excerpt: "Mine" } };
const lastTurn = (params: unknown) => (params as { messages: { content: string }[] }).messages.at(-1)!.content;

test("a reaction with no kind is routed first; the kind event comes before any text", async () => {
  const { client, calls } = fakeClient("Pushback.");
  const { events, stats } = await run(firstReaction, client);
  expect(events).toEqual([{ type: "kind", kind: "pushback" }, { type: "text", text: "Why “the sky fell” [¶1]?" }]);
  expect(calls.create).toHaveLength(1);
  expect(lastTurn(calls.stream[0])).toMatch(/^<reaction>\n[^]*Push back\./);
  expect(stats.citations).toEqual([{ quote: "the sky fell", cited: [1], status: "quote_not_in_paragraph" }]); // checked as usual
});

test("an unparseable router answer falls back to question", async () => {
  const { client, calls } = fakeClient("hmm");
  const { events } = await run(firstReaction, client);
  expect(events[0]).toEqual({ type: "kind", kind: "question" });
  expect(lastTurn(calls.stream[0])).toMatch(/^<reaction>\n[^]*ONE probing question/);
});

test("a reaction with a kind skips the router", async () => {
  const { client, calls } = fakeClient("pushback");
  const { events } = await run({ ...firstReaction, reaction: { excerpt: "Mine", kind: "connection" } }, client);
  expect(calls.create).toHaveLength(0);
  expect(events[0]).toEqual({ type: "kind", kind: "connection" });
});

test("a router failure throws, so the route reports it as an error code", async () => {
  const { client, calls } = fakeClient(new Anthropic.APIError(529, {}, "Overloaded", undefined, "overloaded_error"));
  await expect(run(firstReaction, client)).rejects.toSatisfy((e) => errorCode(e) === "overloaded");
  expect(calls.stream).toHaveLength(0);
});

test("chat and commands yield no kind event", async () => {
  const { client, calls } = fakeClient("pushback");
  const { events } = await run(valid, client);
  expect(events.map((e) => e.type)).toEqual(["text"]);
  expect(calls.create).toHaveLength(0);
});

test("the router and every reaction share chat's system blocks; their prompts ride in the user turn", () => {
  const chat = buildContext({ ...valid, notes: "Mine" });
  const router = routerContext(firstReaction);
  expect(router.system).toEqual(chat.system);
  expect(router.messages).toHaveLength(1);
  expect(router.messages[0].content).toMatch(/^<router>\nThe reader pressed React[^]*one word[^]*<\/router>\n\n<excerpt>\nMine\n<\/excerpt>$/);
  expect(router.messages[0].content).not.toContain("DRAFTED BY CLAUDE");

  for (const kind of ["question", "pushback", "connection"] as const) {
    const reaction = buildContext({ ...firstReaction, reaction: { excerpt: "  Mine \n", kind } });
    expect(reaction.system).toEqual(chat.system);
    expect(reaction.messages).toHaveLength(1);
    const turn = reaction.messages[0].content;
    expect(turn).toMatch(/^<reaction>\nThe reader pressed React[^]*<\/reaction>\n\n<excerpt>\nMine\n<\/excerpt>$/);
    expect(turn).not.toContain("DRAFTED BY CLAUDE");
    expect(reaction.maxTokens).toBe(4000);
  }
});

test("a thread reply re-sends the opening turn, then the thread, then the reply", () => {
  const history = [{ role: "assistant" as const, content: "R1" }, { role: "user" as const, content: "Q1" }, { role: "assistant" as const, content: "A1" }];
  const reaction = { excerpt: "Mine", kind: "pushback" as const };
  const opening = buildContext({ ...firstReaction, reaction }).messages[0];
  const reply = buildContext({ ...valid, notes: "Mine", question: "But why?", history, reaction });
  expect(reply.messages).toEqual([opening, ...history, { role: "user", content: "But why?" }]);
});

test("reaction validation: shape, excerpt, kind, replies, and no command alongside", () => {
  const reaction = { excerpt: "Mine" };
  const thread = [{ role: "assistant", content: "R1" }];
  expect(parseConverseRequest({ ...valid, question: undefined, reaction })).toEqual({ ...valid, question: "", history: [], book: undefined, reaction });
  expect(errorOf({ ...valid, question: 3, reaction })).toBe("question_missing");
  expect(errorOf({ ...valid, reaction: "Mine" })).toBe("reaction_invalid");
  expect(errorOf({ ...valid, reaction: null })).toBe("reaction_invalid");
  expect(errorOf({ ...valid, reaction: { kind: "question" } })).toBe("reaction_invalid");
  expect(errorOf({ ...valid, reaction: { excerpt: " \n" } })).toBe("excerpt_missing");
  expect(errorOf({ ...valid, reaction: { excerpt: "Mine", kind: "rant" } })).toBe("kind_unknown");
  expect(errorOf({ ...valid, reaction: { excerpt: "Mine", kind: "toString" } })).toBe("kind_unknown");
  expect(errorOf({ ...valid, reaction, command: { name: "quiz", selection: "" } })).toBe("request_conflict");
  expect(errorOf({ ...valid, history: thread, reaction })).toBe("kind_missing");
  expect(errorOf({ ...valid, question: "", history: thread, reaction: { ...reaction, kind: "question" } })).toBe("question_missing");
  const startsWithReader = [{ role: "user", content: "Q" }, { role: "assistant", content: "A" }];
  expect(errorOf({ ...valid, history: startsWithReader, reaction: { ...reaction, kind: "question" } })).toBe("history_invalid");
  const reply = { ...valid, history: thread, reaction: { excerpt: "Mine", kind: "question", extra: 1 } };
  expect(parseConverseRequest(reply)).toMatchObject({ reaction: { excerpt: "Mine", kind: "question" } });
  expect(parseConverseRequest(reply)).not.toHaveProperty("reaction.extra");
});

test("a reference text over the D32 cap is refused before any call", () => {
  const passage = "[p. 1] " + "word ".repeat(25_000);
  expect(parseConverseRequest({ passage, question: "Why?" })).toEqual({ error: "reference_too_long" });
});
