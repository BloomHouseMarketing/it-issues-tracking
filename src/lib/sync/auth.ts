import { timingSafeEqual } from "node:crypto";

/** True only for `Authorization: Bearer <secret>` with a configured, matching secret. */
export function isAuthorizedSyncRequest(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !authHeader) return false;
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
