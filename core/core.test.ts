import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// CLAUDE.md: all product logic lives in core/ as plain TypeScript with no Next.js imports.
test("core/ has no Next.js or React imports", () => {
  const dir = join(__dirname);
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const isFrameworkImport = /from\s+["'](next|react)(\/|["'])/;
  const offenders = files.filter((f) => isFrameworkImport.test(readFileSync(join(dir, f), "utf8")));
  expect(offenders).toEqual([]);
});
