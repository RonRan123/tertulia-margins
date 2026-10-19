"use client";

// The settings gear (D47): a small menu of switches at the right end of the top bar. Opens on a
// click; Escape or a click outside closes it; flipping a switch leaves it open. Below the switches,
// "Restore example books" (D49) puts the example books back as shipped (the page confirms first).
import { useEffect, useRef, useState } from "react";
import type { UiState } from "@/core/store.ts";
import { GearIcon } from "./icons";

type Settings = Pick<UiState, "autocomplete" | "pageLinks" | "theme" | "pdfDark">;

export function SettingsMenu({ ui, onChange, onRestoreExamples }: { ui: Settings; onChange: (patch: Partial<Settings>) => void; onRestoreExamples: () => void }) {
  const [isOpen, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const gear = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      gear.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const switches = [
    { label: "Quote autocomplete", isOn: ui.autocomplete, toggle: () => onChange({ autocomplete: !ui.autocomplete }) },
    { label: "Page links", isOn: ui.pageLinks, toggle: () => onChange({ pageLinks: !ui.pageLinks }) },
    { label: "Dark theme", isOn: ui.theme === "dark", toggle: () => onChange({ theme: ui.theme === "dark" ? "light" : "dark" }) },
    // D57: indented under Dark theme, but works on its own.
    { label: "Dark PDF pages", isOn: ui.pdfDark, toggle: () => onChange({ pdfDark: !ui.pdfDark }), isSub: true },
  ];

  return (
    <div className="settings" ref={root}>
      <button
        ref={gear}
        type="button"
        className="quiet icon"
        aria-label="Settings"
        title="Settings"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="settings-menu"
        onClick={() => setOpen(!isOpen)}
      >
        <GearIcon />
      </button>
      {isOpen && (
        <div id="settings-menu" className="settings-menu" role="dialog" aria-label="Settings">
          {switches.map(({ label, isOn, toggle, isSub }) => (
            <label key={label} className={isSub ? "setting is-sub" : "setting"}>
              <span>{label}</span>
              <input type="checkbox" role="switch" checked={isOn} onChange={toggle} />
            </label>
          ))}
          <button
            type="button"
            className="link restore-examples"
            onClick={() => {
              setOpen(false);
              onRestoreExamples();
            }}
          >
            Restore example books
          </button>
        </div>
      )}
    </div>
  );
}
