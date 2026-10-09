import { expect, test } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { buildContext, errorCode, parseConverseRequest } from "./converse.ts";

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

test("a mid-stream overloaded error (no HTTP status) maps to overloaded", () => {
  const midStream = new Anthropic.APIError(undefined, { type: "error" }, "Overloaded", undefined, "overloaded_error");
  expect(errorCode(midStream)).toBe("overloaded");
  expect(errorCode(new Anthropic.APIError(undefined, {}, "boom", undefined, "api_error"))).toBe("api_error");
});
