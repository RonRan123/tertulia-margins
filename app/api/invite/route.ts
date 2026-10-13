// Checks a tester's invite code and, if right, sets the cookie proxy.ts looks for (D34, H1).
import { INVITE_COOKIE } from "@/lib/invite.ts";
const NINETY_DAYS = 60 * 60 * 24 * 90;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const code = typeof body === "object" && body !== null && "code" in body ? String(body.code).trim() : "";
  const isRight = Boolean(process.env.INVITE_CODE) && code === process.env.INVITE_CODE;
  if (!isRight) return Response.json({ error: "invite_wrong" }, { status: 401 });

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${INVITE_COOKIE}=${encodeURIComponent(code)}; Path=/; Max-Age=${NINETY_DAYS}; HttpOnly; SameSite=Lax${secure}`;
  return new Response(null, { status: 204, headers: { "Set-Cookie": cookie } });
}
