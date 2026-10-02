import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { drainJobs } from "@/lib/jobs";

export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Called every minute by Vercel Cron (which sends CRON_SECRET as a bearer token) to retry queued and stalled jobs. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await drainJobs(20));
}
