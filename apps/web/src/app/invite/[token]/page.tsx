import type { Metadata } from "next";
import Link from "next/link";
import { createHash } from "node:crypto";
import { buttonClass } from "@/components/ui";
import { currentUser } from "@/lib/supabase/server";
import { JoinButton } from "./join";

export const metadata: Metadata = { title: "Join workspace", robots: { index: false } };

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-baseline justify-center gap-2">
          <span className="text-[17px] font-bold tracking-[-0.01em]">BASENINE</span>
          <span className="font-pixel text-[14px] text-pink-deep">Feedback</span>
        </div>
        <div className="rounded-2xl bg-panel p-7 shadow-[var(--shadow-pop)]">{children}</div>
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user } = await currentUser();
  const valid = /^[A-Za-z0-9_-]{20,64}$/.test(token);
  const { data } = valid ? await supabase.rpc("invite_preview", { p_token_hash: createHash("sha256").update(token).digest("hex") }) : { data: null };
  const invite = data?.[0];

  if (!invite)
    return (
      <Card>
        <p className="eyebrow text-pink-deep">Invite not active</p>
        <p className="mt-2 text-[14px] text-muted">This invite has expired or been turned off. Ask whoever sent it for a new link.</p>
      </Card>
    );

  const next = `/invite/${token}`;
  return (
    <Card>
      <p className="eyebrow text-pink-deep">You&apos;re invited</p>
      <h1 className="mt-2 text-[24px] font-normal leading-tight tracking-[-0.03em]">Join {invite.workspace_name}</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">You&apos;ll join as {invite.role === "admin" ? "an admin" : "a member"} and see every project in this workspace.</p>
      <div className="mt-6">
        {user ? (
          <JoinButton token={token} email={user.email ?? ""} />
        ) : (
          <div className="flex flex-col gap-2">
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className={buttonClass("primary", "md", "w-full")}>
              Create an account to join
            </Link>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClass("secondary", "md", "w-full")}>
              I already have an account
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
