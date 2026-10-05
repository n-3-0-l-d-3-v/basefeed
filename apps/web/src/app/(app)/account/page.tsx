import type { Metadata } from "next";
import { Kbd } from "@/components/ui";
import { getMembers, getSession } from "@/lib/data";
import { env } from "@/lib/env";
import { ApiTokens, NotificationToggles, ProfileForm, Team } from "./forms";

export const metadata: Metadata = { title: "Account" };

function Section({ title, description, children }: { title: string; description: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 rounded-xl bg-panel p-5 ring-1 ring-line md:grid-cols-[240px_1fr] md:p-6">
      <div>
        <h2 className="text-[16px] font-medium tracking-[-0.01em]">{title}</h2>
        <div className="mt-1 text-[13px] leading-relaxed text-muted">{description}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

const SHORTCUTS: [string, string][] = [
  ["C", "Switch between Comment and Browse on the Canvas"],
  ["Esc", "Close the open comment or cancel a new one"],
  ["Ctrl / ⌘ K", "Search comments, pages and projects"],
  ["F", "Full-screen preview on the Canvas"],
  ["+ / −", "Zoom the preview in or out"],
  ["0", "Fit the preview to the window"],
  ["Ctrl / ⌘ Enter", "Send a comment or reply"],
];

export default async function AccountPage() {
  const { supabase, user, profile, workspaces } = await getSession();
  const adminWs = workspaces.filter((w) => w.role === "owner" || w.role === "admin");
  const [{ data: prefs }, { data: tokens }, { data: invites }, teams] = await Promise.all([
    supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("api_tokens").select("id, name, prefix, last_used_at, created_at, revoked_at").order("created_at", { ascending: false }),
    adminWs.length
      ? supabase.from("workspace_invites").select("id, workspace_id, role, expires_at, revoked_at, created_at").in("workspace_id", adminWs.map((w) => w.id)).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    Promise.all(workspaces.map(async (w) => ({ ...w, members: await getMembers(w.id) }))),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 pb-16 pt-6">
      <div className="px-2 pb-2">
        <p className="eyebrow text-pink-deep">Account</p>
        <h1 className="mt-2 text-[30px] font-normal leading-tight tracking-[-0.035em]">Your settings</h1>
      </div>
      <Section title="Profile" description="Your name appears on comments and replies.">
        <ProfileForm name={profile.name} email={profile.email} />
      </Section>
      <Section title="Email notifications" description="Sent when something needs you. Clients who comment by share link are always emailed replies to their comments.">
        <NotificationToggles timeZone={prefs?.timezone ?? null} initial={{ new_comments: prefs?.new_comments ?? true, daily_digest: prefs?.daily_digest ?? false, weekly_summary: prefs?.weekly_summary ?? false, assignments: prefs?.assignments ?? true, replies: prefs?.replies ?? true }} />
      </Section>
      <Section title="Team" description="Everyone in a workspace sees all of its projects. Invite links work until they expire or you turn them off.">
        <Team userId={user.id} teams={teams} invites={invites ?? []} />
      </Section>
      <Section
        title="AI agents (MCP)"
        description="Let Claude Code, Cursor or any MCP client read open feedback, reply and resolve it, using a personal token."
      >
        <ApiTokens tokens={tokens ?? []} appUrl={env().APP_URL} />
      </Section>
      <Section title="Keyboard shortcuts" description="For moving fast through a review.">
        <dl className="grid gap-2 text-[13px]">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between gap-4 border-b border-line pb-2 last:border-0 last:pb-0">
              <dt className="text-ink-2">{d}</dt>
              <dd>
                <Kbd>{k}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </main>
  );
}
