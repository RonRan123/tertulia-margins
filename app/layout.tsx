import type { Metadata } from "next";
import { Hanken_Grotesk, Literata } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by Next (no npm package). Literata sets the reader's notes; Hanken
// Grotesk the AI and the UI (D6: the AI writes in a different hand). globals.css reads the variables.
const literata = Literata({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-literata" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken" });

export const metadata: Metadata = {
  title: "tertulia-margins",
  description: "A note-first AI reading partner",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${literata.variable} ${hanken.variable}`}>
      <body>{children}</body>
    </html>
  );
}
