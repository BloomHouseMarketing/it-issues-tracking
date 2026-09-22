import { describe, expect, it } from "vitest";
import { checkPassword, isValidSession, safeEqual, sessionToken } from "@/lib/session";

describe("dashboard password session", () => {
  it("accepts a token made from the configured password", async () => {
    const token = await sessionToken("correct-horse-1");
    expect(await isValidSession(token, "correct-horse-1")).toBe(true);
  });

  it("rejects tokens from another password, tampered tokens and missing values", async () => {
    const token = await sessionToken("correct-horse-1");
    expect(await isValidSession(token, "new-password")).toBe(false);
    expect(await isValidSession(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), "correct-horse-1")).toBe(false);
    expect(await isValidSession(undefined, "correct-horse-1")).toBe(false);
    expect(await isValidSession(token, undefined)).toBe(false);
    expect(await isValidSession("correct-horse-1", "correct-horse-1")).toBe(false); // the password itself is not a session
  });

  it("checks the password exactly and fails closed when none is configured", () => {
    expect(checkPassword("correct-horse-1", "correct-horse-1")).toBe(true);
    expect(checkPassword("Correct-horse-1", "correct-horse-1")).toBe(false);
    expect(checkPassword("correct-horse-1 ", "correct-horse-1")).toBe(false);
    expect(checkPassword("", undefined)).toBe(false);
    expect(checkPassword("anything", "")).toBe(false);
  });

  it("compares strings of different lengths safely", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
