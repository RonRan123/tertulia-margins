# tertulia-margins

Note-first AI reading partner: the user writes margin notes, the AI talks back, grounded in the pasted text.
Spec: @docs/DESIGN.md · Progress: docs/PLAN.md · Why: docs/DECISIONS.md

## Working agreement (Ronith drives, Claude executes)
- IMPORTANT: Never make product, architecture, dependency, data-model, or prompt-content decisions silently. Stop and run the `/decide` flow: options, trade-offs, a recommendation, then wait. Routine implementation details (names, file layout inside a module) are yours.
- Ronith owns `prompts/*.md`. Propose edits as diffs with reasoning; don't rewrite his prompts wholesale.
- Before each step: state assumptions and the success criterion ("done when ..."). If something is ambiguous, ask; don't guess.
- After each step: show evidence (test output, command + result, screenshot), then a ≤5-bullet "what changed and why" a newcomer could follow.
- No new npm dependency without asking. Prefer ~30 lines of our own code to a library.
- When reality diverges from DESIGN.md or PLAN.md, update the doc in the same change. Specs stay in sync.
- New idea outside the current step → add to PLAN.md "Parking lot", don't build it.
- After two failed fix attempts on the same problem, stop and summarize what you've learned; don't keep patching.

## Code style (keep cognitive load low)
- All product logic lives in `core/` as plain TypeScript with no Next.js imports. Route handlers stay thin: parse, call core, stream.
- Deep modules: few entry points, simple signatures. Don't split into many tiny files or functions.
- Early returns over nesting; name complex conditions (`const isUnsupported = ...`).
- No class hierarchies. Commands are a data table.
- Errors carry self-describing string codes (`"citation_not_found"`), not magic numbers.
- Minimum code for the current step. No speculative options, no unrequested abstractions. Surgical diffs: don't touch unrelated code.

## Grounding rules (product invariants)
- The AI never edits user notes. AI text is always visually distinct.
- Every claim about the book cites `[¶n]`; unsupported → "not in the text". `checkCitations` must stay green.

## Commands
<!-- Fill in once scaffolded (day 1): dev, build, test, lint, eval -->

## Gotchas
- Never commit book text: it goes in `books/` (gitignored). The public demo uses public-domain text only.
- `ANTHROPIC_API_KEY` lives in `.env.local` (gitignored). See `.env.example`.
- Check current model IDs and pricing with the `claude-api` skill; don't rely on memory.

## Git
- One verified PLAN.md step = one commit. Propose the commit; Ronith approves.
- Start each step from a clean tree. If a step goes sideways, prefer `git restore`/reset to stacking fixes.
