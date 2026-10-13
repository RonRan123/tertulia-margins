"use client";
// The H1 gate's front door (D34): one field for the shared invite code.
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function InvitePage() {
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
    <main className="invite">
      <h1>tertulia-margins</h1>
      <p>A note-first AI reading partner. Testing is invite-only for now.</p>
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
      {isWrong && <p className="invite-wrong">That code didn&apos;t work.</p>}
      <p className="invite-note">Upload only books you own. Your books and notes stay in your browser.</p>
    </main>
  );
}
