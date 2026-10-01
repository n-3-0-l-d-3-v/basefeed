import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runJobs } from "@/lib/jobs";

export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Called by a scheduler (e.g. Vercel Cron, every minute) to retry queued and stalled jobs. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = await runJobs("triage", 10);
  return NextResponse.json(result);
}
