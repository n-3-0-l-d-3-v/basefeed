import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { originOf } from "@/lib/urls";
import { signWidgetToken } from "@/lib/widget/token";
import { GuestForm } from "./guest-form";

export const metadata: Metadata = { title: "Leave feedback", robots: { index: false } };

async function activeLink(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const admin = supabaseAdmin();
  const { data: link } = await admin
    .from("share_links")
    .select("id, project_id, revoked_at, expires_at, projects(name, site_url, archived_at)")
    .eq("token_hash", createHash("sha256").update(token).digest("hex"))
    .maybeSingle();
  const project = link?.projects as unknown as { name: string; site_url: string | null; archived_at: string | null } | null;
  if (!link || !project?.site_url || link.revoked_at || project.archived_at || (link.expires_at && Date.parse(link.expires_at) < Date.now())) return null;
  return { link, project: { ...project, site_url: project.site_url } };
}

export type JoinState = { error: string } | undefined;

const Guest = z.object({ name: z.string().trim().min(1, "Enter your name.").max(80), email: z.email("Enter a valid email.").max(254) });

/** Clients comment with a name and email only: no account. Their token is tied to this link. */
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const active = await activeLink(token);
  if (!active)
    return (
      <main className="dot-grid flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-panel p-7 text-[14px] shadow-[var(--shadow-pop)]">
          <p className="eyebrow text-pink-deep">Link not active</p>
          <p className="mt-2 text-muted">This feedback link has expired or been turned off. Ask the team for a new one.</p>
        </div>
      </main>
    );

  async function join(_: JoinState, form: FormData): Promise<JoinState> {
    "use server";
    const parsed = Guest.safeParse({ name: form.get("name"), email: String(form.get("email") ?? "").toLowerCase() });
    if (!parsed.success) return { error: parsed.error.issues[0]!.message };
    const current = await activeLink(token);
    if (!current) return { error: "This link is no longer active." };
    const admin = supabaseAdmin();
    const { data: allowed } = await admin.rpc("hit_rate_limit", { p_bucket: `join:${current.link.id}`, p_limit: 60, p_window_seconds: 3600 });
    if (allowed === false) return { error: "Too many sign-ins on this link. Try again later." };
    const { data: guest, error } = await admin
      .from("guests")
      .upsert({ project_id: current.link.project_id, email: parsed.data.email, name: parsed.data.name }, { onConflict: "project_id,email" })
      .select("id, name")
      .single();
    if (error) return { error: "Couldn't sign you in. Try again." };
    const widgetToken = await signWidgetToken({
      sub: guest.id,
      kind: "guest",
      pid: current.link.project_id,
      org: originOf(current.project.site_url)!,
      name: guest.name,
      sl: current.link.id,
    });
    // Fragment, not query: never sent to the site's server or in Referer headers; the widget strips it.
    redirect(`${current.project.site_url}#bn_token=${encodeURIComponent(widgetToken)}`);
  }

  return <GuestForm projectName={active.project.name} site={active.project.site_url} action={join} />;
}
