// Usage: npm run ask -- <passage-file> "<question>" ["Title | Author"]
import { readFileSync } from "node:fs";
import { converse } from "../core/converse.ts";

const [file, question, titleAuthor] = process.argv.slice(2);
if (!file || !question) {
  console.error('usage: npm run ask -- <passage-file> "<question>" ["Title | Author"]');
  process.exit(1);
}

const [title, author] = (titleAuthor ?? "").split("|").map((s) => s.trim() || undefined);
const reply = converse({ passage: readFileSync(file, "utf8"), question, book: { title, author } });
let step = await reply.next();
while (!step.done) {
  process.stdout.write(step.value);
  step = await reply.next();
}

const stats = step.value;
const ms = (n: number | null) => (n === null ? "n/a" : `${Math.round(n)} ms`);
console.log(`\n\n--- ${stats.model} | stop: ${stats.stopReason} | TTFT ${ms(stats.ttftMs)} | total ${ms(stats.totalMs)}`);
console.log(`--- tokens in ${stats.usage.input_tokens} / out ${stats.usage.output_tokens}`);
