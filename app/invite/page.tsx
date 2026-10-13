"use client";
// The landing page (D34, H1): the first thing a visitor sees. The painting on one side; on the
// other, what the app does and one field for the shared invite code.
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function LandingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isWrong, setIsWrong] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (response.ok) router.replace("/");
    else setIsWrong(true);
  }

  return (
    <main className="landing">
      <div className="landing-art">
        <Image
          src="/landing-page-book-discussion.jpg"
          alt="An impressionist painting of a salon: people in nineteenth-century dress reading and talking around a table."
          fill
          sizes="(max-width: 760px) 100vw, 50vw"
          fetchPriority="high"
        />
      </div>
      <div className="landing-copy">
        <p className="landing-wordmark">tertulia</p>
        <h1>A tertulia of one.</h1>
        <p className="landing-lede">You write the margin notes. Your reading partner talks back.</p>
        <ul className="landing-points">
          <li>Write as you read, in markdown, the way you would in Obsidian.</li>
          <li>Press React and it answers in the margin: a question, a pushback, or a connection to another passage.</li>
          <li>Every claim about the book cites the passage, or says it&apos;s not in the text.</li>
        </ul>
        <form onSubmit={submit}>
          <input
            aria-label="Invite code"
            placeholder="Invite code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setIsWrong(false);
            }}
            autoFocus
          />
          <button type="submit" disabled={!code.trim()}>
            Enter
          </button>
        </form>
        {isWrong && (
          <p className="landing-wrong" role="alert">
            That code didn&apos;t work.
          </p>
        )}
        <p className="landing-note">
          Testing is invite-only for now. Your books and notes stay in this browser; upload only books you own.
        </p>
      </div>
    </main>
  );
}
