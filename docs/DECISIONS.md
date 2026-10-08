# Decision Log

Append-only. Each entry records **what** was decided, **who** decided, the **alternatives**, and **why**. Code and tests show *what*; this file keeps the *why*.

Status values: `Open` → `Provisional` (default chosen, revisit allowed) → `Accepted` → `Superseded by Dn`.

To add one, run `/decide <topic>`, or copy the template at the bottom.

---

## D1. Tech stack: Next.js + TypeScript
- **Status:** Provisional (2026-10-08, Ronith: "fine for the time being")
- **Alternatives:** Python FastAPI + vanilla JS; Streamlit/Gradio; local CLI/desktop.
- **Why:** one language end to end, first-class streaming, free Vercel deploy for a live portfolio link.
- **Cost we accept:** framework magic. Mitigated by keeping all logic in plain-TS `core/` and using Next only as a thin shell.
- **Revisit if:** Python evals/retrieval tooling becomes the bottleneck on day 6–7.

## D2. Working agreement: ask first, log decisions
- **Status:** Provisional (2026-10-08)
- **Alternatives:** explain-after-each-step; Ronith writes the core while Claude scaffolds.
- **Why:** keeps Ronith in the driver's seat without making him type the boilerplate. Ronith owns `prompts/`; Claude owns plumbing.
- **Details:** see CLAUDE.md, "Working agreement".

## D3. Book input: paste text
- **Status:** Provisional (2026-10-08)
- **Alternatives:** DRM-free EPUB/txt upload (~2 h); photo + OCR (time sink).
- **Why:** zero ingestion work, so v0 can test the core idea on day 1.
- **Revisit if:** v3 (whole book) needs it, or pasting proves harder than the Obsidian habit.

## D4. Grounding via paragraph IDs + deterministic citation check
- **Status:** Provisional (2026-10-08), proposed in DESIGN.md §6.2
- **Alternatives:** prompt-only grounding; Anthropic citations API feature.
- **Why:** a check we control makes hallucination a number, not a vibe.
- **Open sub-question:** compare against the API's built-in citations on day 2 (`/decide` then).

---

## Template

```
## Dn. <title>
- **Status:** Open | Provisional | Accepted | Superseded by Dm  (date, who)
- **Context:** what forced the decision
- **Alternatives:** A; B; C
- **Why:** the deciding trade-off, in one or two sentences
- **Cost we accept:**
- **Revisit if:**
```
