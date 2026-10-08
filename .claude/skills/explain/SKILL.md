---
name: explain
description: Walk Ronith through code so he understands and can defend it. Use when he asks how something works, what a file does, or invokes /explain.
disable-model-invocation: true
---

Subject: $ARGUMENTS (if empty, the most recent change: `git diff HEAD~1`)

1. **One-sentence purpose.** What problem this code solves in the product.
2. **The path of one request.** Trace a concrete example (e.g. "user runs /define on ¶4") through the code with `file:line` references. Follow the data, not the file order.
3. **Why this shape.** The key design choice, the alternative we didn't take, and the DECISIONS.md entry if one exists.
4. **Where it breaks.** The most likely failure mode and how we'd notice it.
5. **Check understanding.** Ask Ronith 2 short questions he should be able to answer now (e.g. "what happens if the model cites ¶99?"). Give feedback on his answers; don't lecture ahead of them.

Pitch it at a strong engineer who didn't write this code. No filler.
