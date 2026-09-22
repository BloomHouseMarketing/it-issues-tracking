"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, SESSION_COOKIE, SESSION_MAX_AGE_S, sessionToken } from "@/lib/session";

export async function login(_prev: { error: string } | null, formData: FormData): Promise<{ error: string }> {
  const password = process.env.DASHBOARD_PASSWORD;
  const attempt = String(formData.get("password") ?? "");
  if (!checkPassword(attempt, password)) {
    // Slow down guessing a little.
    await new Promise((r) => setTimeout(r, 800));
    return { error: password ? "Incorrect password." : "DASHBOARD_PASSWORD is not configured on the server." };
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, await sessionToken(password!), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  const next = String(formData.get("next") ?? "/");
  // Only same-site relative paths, to avoid an open redirect.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
