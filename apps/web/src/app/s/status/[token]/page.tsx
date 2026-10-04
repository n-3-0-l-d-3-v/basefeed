import type { Metadata } from "next";
import { Ago } from "@/components/ago";
import { clientLink } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyStatusToken } from "@/lib/widget/token";

export const metadata: Metadata = { title: "Your feedback", robots: { index: false }, referrer: "no-referrer" };

type Row = {
  id: string;
  number: number;
  body: string;
  status: string;
  client_review: string | null;
  updated_at: string;
  project_id: string;
  page: { url: string; title: string | null };
};

const GROUPS = [
  { key: "waiting", title: "Waiting for you", hint: "The team has made these changes. Open each one and tell them if it looks right." },
  { key: "progress", title: "Being worked on", hint: "" },
  { key: "open", title: "Not started yet", hint: "" },
  { key: "done", title: "Done", hint: "" },
] as const;
type Group = (typeof GROUPS)[number]["key"];

function groupOf(c: Row): Group {
  if (c.status === "resolved") return c.client_review === "pending" ? "waiting" : "done";
  return c.status === "in_progress" ? "progress" : "open";
}

function note(c: Row): string | null {
  if (c.client_review === "approved") return "You confirmed this";
  if (c.client_review === "rejected") return "Reopened after your note";
  return null;
}

const expired = (iso: string | null) => !!iso && Date.parse(iso) < Date.now();

function Inactive() {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-panel p-7 text-[14px] shadow-[var(--shadow-pop)]">
        <p className="eyebrow text-pink-deep">Link not active</p>
        <p className="mt-2 text-muted">This status link has expired or been turned off. Ask the team for a new one.</p>
      </div>
    </main>
  );
}

/**
 * One link for a client: where each of their comments stands. Read-only, no account. The link is
 * signed for one client on one project and works only while the project still has the share link
 * it was issued under, so turning client access off turns this off too.
 */
export default async function StatusPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claims = await verifyStatusToken(decodeURIComponent(token));
  if (!claims) return <Inactive />;

  const admin = supabaseAdmin();
  const [{ data: guest }, { data: project }, { data: link }, { data: allowed }] = await Promise.all([
    admin.from("guests").select("id, name").eq("id", claims.sub).eq("project_id", claims.pid).maybeSingle(),
    admin.from("projects").select("id, name, archived_at").eq("id", claims.pid).maybeSingle(),
    admin.from("share_links").select("revoked_at, expires_at").eq("id", claims.sl).eq("project_id", claims.pid).maybeSingle(),
    admin.rpc("hit_rate_limit", { p_bucket: `status:${claims.sub}`, p_limit: 120, p_window_seconds: 3600 }),
  ]);
  const linkActive = link && !link.revoked_at && !expired(link.expires_at);
  if (!guest || !project || project.archived_at || !linkActive || allowed === false) return <Inactive />;

  const { data } = await admin
    .from("comments")
    .select("id, number, body, status, client_review, updated_at, project_id, page:pages(url, title)")
    .eq("project_id", project.id)
    .eq("author_guest_id", guest.id)
    .order("number");
  const comments = (data ?? []) as unknown as Row[];

  const ids = comments.map((c) => c.id);
  const { data: replies } = ids.length
    ? await admin.from("replies").select("comment_id, author_name, body, created_at").in("comment_id", ids).is("author_guest_id", null).order("created_at", { ascending: false })
    : { data: [] };
  const lastReply = new Map<string, { author_name: string; body: string }>();
  for (const r of replies ?? []) if (!lastReply.has(r.comment_id)) lastReply.set(r.comment_id, r);

  const links = new Map<string, string>();
  for (const c of comments) links.set(c.id, await clientLink(c, guest));

  const count = (g: Group) => comments.filter((c) => groupOf(c) === g).length;
  const summary = [
    [count("waiting"), "waiting for you"],
    [count("progress"), "being worked on"],
    [count("open"), "not started"],
    [count("done"), "done"],
  ] as const;

  return (
    <main className="dot-grid min-h-screen px-4 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <header className="rounded-2xl bg-panel p-6 ring-1 ring-line">
          <p className="eyebrow text-pink-deep">{project.name}</p>
          <h1 className="mt-1 text-[22px] font-medium tracking-[-0.02em]">Your feedback, {guest.name}</h1>
          <p className="mt-1 text-[14px] text-muted">
            {comments.length === 0
              ? "You have not left any comments yet."
              : `${comments.length} comment${comments.length === 1 ? "" : "s"}: ${summary
                  .filter(([n]) => n > 0)
                  .map(([n, label]) => `${n} ${label}`)
                  .join(", ")}.`}
          </p>
        </header>

        {GROUPS.map((g) => {
          const items = comments.filter((c) => groupOf(c) === g.key);
          if (items.length === 0) return null;
          return (
            <section key={g.key} aria-labelledby={`g-${g.key}`} className="rounded-2xl bg-panel p-6 ring-1 ring-line">
              <h2 id={`g-${g.key}`} className="text-[16px] font-medium tracking-[-0.01em]">
                {g.title} <span className="text-muted">({items.length})</span>
              </h2>
              {g.hint && <p className="mt-1 text-[13px] text-muted">{g.hint}</p>}
              <ul className="mt-3 divide-y divide-line">
                {items.map((c) => {
                  const reply = lastReply.get(c.id);
                  const extra = note(c);
                  return (
                    <li key={c.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                      <p className="text-[14px] leading-relaxed">
                        <span className="font-mono text-[12px] text-muted">#{c.number}</span> {c.body.length > 280 ? `${c.body.slice(0, 279)}…` : c.body}
                      </p>
                      {reply && (
                        <p className="rounded-lg bg-sunken px-3 py-2 text-[13px] leading-relaxed">
                          <span className="font-medium">{reply.author_name}:</span> {reply.body.length > 200 ? `${reply.body.slice(0, 199)}…` : reply.body}
                        </p>
                      )}
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                        <span>{c.page.title || new URL(c.page.url).pathname}</span>
                        {extra && <span>{extra}</span>}
                        <span>
                          Updated <Ago iso={c.updated_at} />
                        </span>
                        <a className="font-medium text-ink underline" href={links.get(c.id)}>
                          {g.key === "waiting" ? "Check it on the page" : "Open on the page"}
                        </a>
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
