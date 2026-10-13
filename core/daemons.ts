// Daemons (D37): named companions in the margin, each one persona × one action. Like COMMANDS and
// REACTIONS, both are rows. The action is app-owned: its prompt sets the job and what it must cite;
// the persona (name, colour, and a prompt file holding voice, personality and free-text prompt) sets
// who says it. Browser-safe (no node:fs): the UI imports the table for names and colours.

export const ACTIONS = {
  connect: { promptFile: "action-connect.md" },
  counter: { promptFile: "action-counter.md" },
};

export const DAEMONS = {
  author: { name: "The Author", colour: "#8a7650", action: "connect", promptFile: "daemon-author.md" },
  "devils-advocate": { name: "The Devil's Advocate", colour: "#b4441a", action: "counter", promptFile: "daemon-devils-advocate.md" },
} as const satisfies Record<string, { name: string; colour: string; action: keyof typeof ACTIONS; promptFile: string }>;

export type DaemonId = keyof typeof DAEMONS;
export const DAEMON_IDS = Object.keys(DAEMONS) as DaemonId[];

// One run looks at `excerpt`: the reader's new or changed lines. `mustPick`: the margin has gone too
// long without a card, so the reviewer must show one if any daemon drafted something.
export type DaemonsRequest = { excerpt: string; mustPick?: boolean };
// A daemon's draft that survived the grounding check. `anchor`: the words of the excerpt it answers.
export type Nugget = { daemon: DaemonId; text: string; anchor: string };
