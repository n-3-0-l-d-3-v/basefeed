import { handleNotify } from "./notify";
import { supabaseAdmin } from "./supabase/server";
import { runTriage, triageProvider } from "./triage";
import { PermanentTriageError } from "./triage/types";
import { deliverWebhook } from "./webhooks";

export type JobKind = "triage" | "notify" | "webhook";

interface Handler {
  run(payload: Record<string, unknown>): Promise<void>;
  /** Called once retries are exhausted or the failure is permanent. */
  giveUp(payload: Record<string, unknown>): Promise<void>;
}

const handlers: Record<JobKind, Handler> = {
  triage: {
    run: (p) => runTriage(String(p.commentId)),
    giveUp: async (p) => {
      await supabaseAdmin().from("comments").update({ triage_state: "unavailable" }).eq("id", String(p.commentId)).eq("triage_state", "pending");
    },
  },
  notify: {
    run: (p) => handleNotify(p as Parameters<typeof handleNotify>[0]),
    giveUp: async () => {},
  },
  webhook: {
    run: (p) => deliverWebhook(p as unknown as Parameters<typeof deliverWebhook>[0]),
    giveUp: async () => {},
  },
};

/**
 * Queue AI triage for a new comment. Idempotent per comment. Returns a function that drains the
 * queue (run it after the response is sent); a scheduler hits /api/jobs/run to retry failures.
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
    await drainJobs();
  };
}

export async function runJobs(kind: JobKind, limit = 5): Promise<{ done: number; failed: number }> {
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

/** Process whatever is ready, of every kind. Safe to call often: claiming is atomic. */
export async function drainJobs(limit = 10) {
  const [triage, notify, webhook] = await Promise.all([runJobs("triage", limit), runJobs("notify", limit), runJobs("webhook", limit)]);
  return { triage, notify, webhook };
}
