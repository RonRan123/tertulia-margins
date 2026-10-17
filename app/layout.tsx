import type { Metadata } from "next";
import "pdfjs-dist/web/pdf_viewer.css"; // the PDF view's pages, text layer and search highlights (D29)
import "./globals.css";

// Fonts are Obsidian's defaults (D27): the system UI face for text and interface, the system
// monospace for code. Nothing is downloaded; globals.css holds the stacks.

export const metadata: Metadata = {
  title: "Tertulia",
  description: "A note-first AI reading partner",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
