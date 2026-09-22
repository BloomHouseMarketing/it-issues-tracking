// Password-gate session. The cookie holds an HMAC of a fixed label keyed by
// DASHBOARD_PASSWORD: it can't be forged without the password, and changing the
// password signs everyone out. Uses Web Crypto so it runs in the proxy too.

export const SESSION_COOKIE = "coastal_session";
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days; a wall TV stays signed in

const LABEL = "coastal-it-dashboard-session-v1";

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function sessionToken(password: string): Promise<string> {
  return hmac(password, LABEL);
}

/** True if `token` is a valid session for the configured password. */
export async function isValidSession(token: string | undefined, password: string | undefined): Promise<boolean> {
  if (!token || !password) return false;
  return safeEqual(token, await sessionToken(password));
}

/** True if `attempt` matches the configured password. Fails closed if none is set. */
export function checkPassword(attempt: string, password: string | undefined): boolean {
  if (!password) return false;
  return safeEqual(attempt, password);
}
