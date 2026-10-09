"use client";

import { useState } from "react";
import { Chat } from "./components/Chat";
import { ReferenceText } from "./components/ReferenceText";

// Sprint 2: reference-text box + chat. Sprint 3 makes this notes | chat with the reference text in a drawer (D14).
export default function Home() {
  const [reference, setReference] = useState("");
  return (
    <main>
      <h1>tertulia-margins</h1>
      <ReferenceText value={reference} onChange={setReference} />
      <Chat reference={reference} />
    </main>
  );
}
