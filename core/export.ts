// Markdown export for Obsidian (D7, D17): the notes exactly as written, under YAML frontmatter
// with the export date and the reference's page range. No AI text, no reference text (D6).
import { pageRange, parsePassage } from "./passage.ts";

export type ExportFile = { filename: string; content: string };

export function exportMarkdown(notes: string, reference: string, date: Date): ExportFile {
  const day = localDate(date);
  const pages = pageRange(parsePassage(reference));
  const frontmatter = ["---", `exported: ${day}`, ...(pages ? [`reference_pages: ${yamlString(pages)}`] : []), "---"];
  return { filename: `tertulia-notes-${day}.md`, content: `${frontmatter.join("\n")}\n\n${notes}` };
}

// YYYY-MM-DD in the user's time zone: the day they exported, not the UTC day.
function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Page labels are plain ("p. 101 to PDF pp. 3–4"); anything else is double-quoted (JSON strings are valid YAML).
export function yamlString(value: string): string {
  const isPlain = /^[A-Za-z0-9][A-Za-z0-9 .–-]*$/.test(value);
  return isPlain ? value : JSON.stringify(value);
}
