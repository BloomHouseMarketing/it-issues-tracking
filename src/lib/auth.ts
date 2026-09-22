import "server-only";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "./session";

/** For Server Components and Server Actions. */
export async function isSignedIn(): Promise<boolean> {
  const store = await cookies();
  return isValidSession(store.get(SESSION_COOKIE)?.value, process.env.DASHBOARD_PASSWORD);
}
