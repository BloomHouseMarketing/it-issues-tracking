import { describe, expect, it, vi } from "vitest";
import { COMPLEXITY_RETRY_DELAY_MS, createMondayClient, MondayApiError } from "@/lib/monday/client";

function respond(...bodies: { status?: number; body: unknown }[]) {
  const fetchMock = vi.fn();
  for (const b of bodies) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(b.body), { status: b.status ?? 200 }));
  }
  return fetchMock;
}

const budgetError = {
  errors: [{ message: "Complexity budget exhausted, query cost 30001 budget remaining 12 out of 5000000 reset in 42 seconds" }],
};

describe("monday client", () => {
  it("sends the token and returns data", async () => {
    const fetchMock = respond({ body: { data: { me: { id: 1 } } } });
    const query = createMondayClient({ token: "tok", fetch: fetchMock });
    await expect(query("query { me { id } }")).resolves.toEqual({ me: { id: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.monday.com/v2");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("tok");
    expect(init.headers["API-Version"]).toBeUndefined();
  });

  it("throws GraphQL errors without retrying", async () => {
    const fetchMock = respond({ body: { errors: [{ message: "Field 'x' doesn't exist" }] } });
    const sleep = vi.fn();
    const query = createMondayClient({ token: "t", fetch: fetchMock, sleep });
    await expect(query("q")).rejects.toThrow(/Field 'x' doesn't exist/);
    expect(sleep).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on non-JSON and HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html>bad gateway</html>", { status: 502 }));
    const query = createMondayClient({ token: "t", fetch: fetchMock });
    await expect(query("q")).rejects.toBeInstanceOf(MondayApiError);
  });

  it("throws legacy error_message responses", async () => {
    const fetchMock = respond({ status: 401, body: { error_message: "Not Authenticated" } });
    const query = createMondayClient({ token: "t", fetch: fetchMock });
    await expect(query("q")).rejects.toThrow(/Not Authenticated/);
  });

  it("waits 60 s and retries once when the complexity budget is exhausted", async () => {
    const fetchMock = respond({ status: 429, body: budgetError }, { body: { data: { ok: true } } });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const query = createMondayClient({ token: "t", fetch: fetchMock, sleep });
    await expect(query("q")).resolves.toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(COMPLEXITY_RETRY_DELAY_MS);
    expect(COMPLEXITY_RETRY_DELAY_MS).toBe(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after the single retry", async () => {
    const fetchMock = respond({ body: budgetError }, { body: budgetError });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const query = createMondayClient({ token: "t", fetch: fetchMock, sleep });
    await expect(query("q")).rejects.toThrow(/Complexity budget exhausted/);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
