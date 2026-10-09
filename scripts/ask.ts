// Usage: npm run ask -- <passage-file> "<question>"
import { readFileSync } from "node:fs";
import { converse } from "../core/converse.ts";

const [file, question] = process.argv.slice(2);
if (!file || !question) {
  console.error('usage: npm run ask -- <passage-file> "<question>"');
  process.exit(1);
}

const reply = converse({ passage: readFileSync(file, "utf8"), question });
let step = await reply.next();
while (!step.done) {
  process.stdout.write(step.value);
  step = await reply.next();
}

const stats = step.value;
const ms = (n: number | null) => (n === null ? "n/a" : `${Math.round(n)} ms`);
console.log(`\n\n--- ${stats.model} | stop: ${stats.stopReason} | TTFT ${ms(stats.ttftMs)} | total ${ms(stats.totalMs)}`);
console.log(`--- tokens in ${stats.usage.input_tokens} / out ${stats.usage.output_tokens}`);
