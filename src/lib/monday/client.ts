// Minimal read-only monday.com GraphQL client.

export const MONDAY_API_URL = "https://api.monday.com/v2";
export const COMPLEXITY_RETRY_DELAY_MS = 60_000;

export class MondayApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MondayApiError";
  }
}

export interface MondayClientOptions {
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Optional `API-Version` header (e.g. "2025-10"). Omit to use monday's current default. */
  apiVersion?: string;
}

export type MondayQuery = <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isComplexityBudgetError(err: unknown): boolean {
  return err instanceof Error && /complexity budget exhausted/i.test(err.message);
}

/**
 * Returns a query function. Every call is a single POST; callers run pages
 * sequentially. If monday reports "Complexity budget exhausted", waits 60 s
 * and retries once.
 */
export function createMondayClient(options: MondayClientOptions): MondayQuery {
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;

  async function once<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: options.token,
    };
    if (options.apiVersion) headers["API-Version"] = options.apiVersion;

    const res = await doFetch(MONDAY_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    const text = await res.text();

    let body: {
      data?: T;
      errors?: { message?: string }[];
      error_message?: string;
    };
    try {
      body = JSON.parse(text);
    } catch {
      throw new MondayApiError(`monday API ${res.status}: ${text.slice(0, 500)}`, res.status);
    }

    const messages = [
      ...(body.errors ?? []).map((e) => e.message ?? JSON.stringify(e)),
      ...(body.error_message ? [body.error_message] : []),
    ];
    if (!res.ok || messages.length > 0 || body.data === undefined) {
      const detail = messages.length > 0 ? messages.join("; ") : text.slice(0, 500);
      throw new MondayApiError(`monday API ${res.status}: ${detail}`, res.status);
    }
    return body.data;
  }

  return async function query<T>(q: string, variables?: Record<string, unknown>): Promise<T> {
    try {
      return await once<T>(q, variables);
    } catch (err) {
      if (!isComplexityBudgetError(err)) throw err;
      await sleep(COMPLEXITY_RETRY_DELAY_MS);
      return once<T>(q, variables);
    }
  };
}
