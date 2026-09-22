import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sync", () => ({
  runSyncFromEnv: vi.fn(async () => ({ ok: true, runId: 1, itemsSynced: 3, deleted: 0, byGroup: {}, completedAtFound: 0 })),
}));

import { GET, POST } from "@/app/api/sync/route";
import { runSyncFromEnv } from "@/lib/sync";
import { isAuthorizedSyncRequest } from "@/lib/sync/auth";

const SECRET = "s".repeat(40);

function req(auth?: string, method = "POST") {
  return new Request("http://localhost/api/sync", {
    method,
    headers: auth === undefined ? {} : { authorization: auth },
  });
}

describe("/api/sync auth", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.mocked(runSyncFromEnv).mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["missing header", undefined],
    ["wrong secret", `Bearer ${"x".repeat(40)}`],
    ["secret without Bearer", SECRET],
    ["lowercase scheme", `bearer ${SECRET}`],
    ["prefix of the secret", `Bearer ${SECRET.slice(0, 10)}`],
  ])("rejects %s with 401 and does not sync", async (_label, auth) => {
    const res = await POST(req(auth));
    expect(res.status).toBe(401);
    expect(runSyncFromEnv).not.toHaveBeenCalled();
  });

  it("rejects everything when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(req("Bearer "));
    expect(res.status).toBe(401);
    expect(isAuthorizedSyncRequest("Bearer x", undefined)).toBe(false);
  });

  it("runs the sync for POST and GET (Vercel Cron) with the right secret", async () => {
    expect((await POST(req(`Bearer ${SECRET}`))).status).toBe(200);
    const res = await GET(req(`Bearer ${SECRET}`, "GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, itemsSynced: 3 });
    expect(runSyncFromEnv).toHaveBeenCalledTimes(2);
  });
});
