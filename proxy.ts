// H1 gate (D34): with INVITE_CODE set (the hosted app), every page and the AI route need the
// invite cookie that /invite sets. Unset (local dev), everything is open.
import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE } from "./lib/invite.ts";

export function proxy(request: NextRequest) {
  const code = process.env.INVITE_CODE;
  const isOpen = !code || request.cookies.get(INVITE_COOKIE)?.value === code;
  if (isOpen) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "invite_required" }, { status: 401 });
  return NextResponse.redirect(new URL("/invite", request.url));
}

// Not the invite page and its route, Next's assets, or any file with an extension (e.g. the pdfjs worker).
export const config = {
  matcher: ["/((?!invite|api/invite|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
