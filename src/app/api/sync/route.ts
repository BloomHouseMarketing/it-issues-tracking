import { isAuthorizedSyncRequest } from "@/lib/sync/auth";
import { runSyncFromEnv } from "@/lib/sync";

// Room for a full read plus one 60 s complexity-budget retry.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  if (!isAuthorizedSyncRequest(request.headers.get("authorization"), process.env.SYNC_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSyncFromEnv();
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST for n8n and manual calls; GET because Vercel Cron sends GET requests.
export const POST = handle;
export const GET = handle;
