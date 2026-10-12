// Top-bar icons (D30): inline SVGs drawn after Lucide (https://lucide.dev, ISC licence,
// Copyright (c) Lucide Contributors). Stroke icons in currentColor, so they follow the text colour.
import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ico"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PanelLeftIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
  </Icon>
);

// The margin: a column on the right of the page.
export const MarginIcon = () => (
  <Icon>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M15 3v18" />
  </Icon>
);

export const FileTextIcon = () => (
  <Icon>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </Icon>
);

export const ChatIcon = () => (
  <Icon>
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
  </Icon>
);

export const BookIcon = () => (
  <Icon>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </Icon>
);

export const MaximizeIcon = () => (
  <Icon>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="M21 3l-7 7" />
    <path d="M3 21l7-7" />
  </Icon>
);

export const MinimizeIcon = () => (
  <Icon>
    <path d="M4 14h6v6" />
    <path d="M20 10h-6V4" />
    <path d="M14 10l7-7" />
    <path d="M3 21l7-7" />
  </Icon>
);

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </Icon>
);
