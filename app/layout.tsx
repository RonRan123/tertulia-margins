import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tertulia-margins",
  description: "A note-first AI reading partner",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
