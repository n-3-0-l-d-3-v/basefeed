import { supabaseAdmin } from "./supabase/server";
import { runTriage, triageProvider } from "./triage";
import { PermanentTriageError } from "./triage/types";

type Kind = "triage";

const handlers: Record<Kind, { run(payload: Record<string, unknown>): Promise<void>; giveUp(payload: Record<string, unknown>): Promise<void> }> = {
  triage: {
    run: (p) => runTriage(String(p.commentId)),
    giveUp: async (p) => {
      await supabaseAdmin().from("comments").update({ triage_state: "unavailable" }).eq("id", String(p.commentId)).eq("triage_state", "pending");
    },
  },
};

/**
 * Queue AI triage for a new comment. Idempotent per comment. Returns a function that drains the
 * queue (run it after the response is sent); a cron hits /api/jobs/run to retry anything that failed.
 */
export async function enqueueTriage(commentId: string): Promise<(() => Promise<void>) | null> {
  const admin = supabaseAdmin();
  if (!triageProvider()) {
    await admin.from("comments").update({ triage_state: "unavailable" }).eq("id", commentId);
    return null;
  }
  const { error } = await admin.from("jobs").insert({ kind: "triage", payload: { commentId }, idempotency_key: `triage:${commentId}` });
  if (error && error.code !== "23505") throw error;
  return async () => {
    await runJobs("triage");
  };
}

export async function runJobs(kind: Kind, limit = 5): Promise<{ done: number; failed: number }> {
  const admin = supabaseAdmin();
  const { data: jobs, error } = await admin.rpc("claim_jobs", { p_kind: kind, p_limit: limit });
  if (error) throw error;
  let done = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    const payload = (job.payload ?? {}) as Record<string, unknown>;
    try {
      await handlers[kind].run(payload);
      await admin.rpc("finish_job", { p_id: job.id });
      done++;
    } catch (e) {
      failed++;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[jobs] ${kind}#${job.id} attempt ${job.attempts} failed:`, message);
      if (e instanceof PermanentTriageError || job.attempts >= job.max_attempts) {
        await admin.from("jobs").update({ status: "failed", last_error: message.slice(0, 500), locked_at: null }).eq("id", job.id);
        await handlers[kind].giveUp(payload);
      } else {
        await admin.rpc("finish_job", { p_id: job.id, p_error: message.slice(0, 500) });
      }
    }
  }
  return { done, failed };
}
