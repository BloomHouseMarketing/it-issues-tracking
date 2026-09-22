import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/session";

// Every page needs the dashboard password. /api/sync has its own Bearer-token
// check (Vercel Cron), and /login must stay reachable.
export async function proxy(request: NextRequest) {
  const ok = await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, process.env.DASHBOARD_PASSWORD);
  if (ok) return NextResponse.next();
  const login = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/sync|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
