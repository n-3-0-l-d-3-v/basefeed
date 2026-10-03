import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { getSession } from "@/lib/data";
import { NewProjectButton } from "./new-project";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const { supabase, profile, workspaces } = await getSession();
  const [{ data: projects }, { data: open }] = await Promise.all([
    supabase.from("projects").select("id, name, site_url, updated_at, pages(count)").is("archived_at", null).order("updated_at", { ascending: false }),
    supabase.from("comments").select("project_id, anchor_state, change_summary").neq("status", "resolved"),
  ]);

  const stats = new Map<string, { open: number; attention: number }>();
  for (const c of open ?? []) {
    const s = stats.get(c.project_id) ?? { open: 0, attention: 0 };
    s.open++;
    const changed = ((c.change_summary as { changes?: unknown[] } | null)?.changes?.length ?? 0) > 0;
    if (c.anchor_state === "detached" || c.anchor_state === "suggested" || changed) s.attention++;
    stats.set(c.project_id, s);
  }
  const totalOpen = [...stats.values()].reduce((n, s) => n + s.open, 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-[14px] text-pink-text!">(Hi {profile.name.split(" ")[0] || "there"})</p>
          <h1 className="mt-2 text-[clamp(34px,4.4vw,48px)] font-normal leading-[1.08] tracking-[-0.035em]">
            {totalOpen ? (
              <>
                <span className="tabular">{totalOpen}</span> open <span className="font-display">{totalOpen === 1 ? "comment" : "comments"}</span> across your sites
              </>
            ) : (
              "Client sites"
            )}
          </h1>
        </div>
        <NewProjectButton workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} />
      </div>

      {!projects?.length ? (
        <div className="rounded-xl bg-panel ring-1 ring-line">
          <EmptyState title="No projects yet" action={<NewProjectButton workspaces={workspaces.map((w) => ({ id: w.id, name: w.name }))} />}>
            Add a client site, paste one line into Webflow, and comments start landing on the exact element they&apos;re about.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const s = stats.get(p.id) ?? { open: 0, attention: 0 };
            const pages = (p.pages as unknown as { count: number }[])[0]?.count ?? 0;
            return (
              <li key={p.id}>
                <Link href={`/p/${p.id}`} className="group flex h-full flex-col gap-6 rounded-xl bg-panel p-5 ring-1 ring-line transition-shadow hover:shadow-[var(--shadow-soft)] hover:ring-line-strong">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-[16px] font-medium">{p.name}</h2>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{p.site_url?.replace(/^https?:\/\//, "")}</p>
                    </div>
                    <ArrowUpRight aria-hidden className="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
                  </div>
                  <dl className="mt-auto grid grid-cols-3 gap-3 border-t border-line pt-4">
                    <div>
                      <dt className="eyebrow">Open</dt>
                      <dd className="tabular mt-1 text-[22px] leading-none">{s.open}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Needs a look</dt>
                      <dd className={`tabular mt-1 text-[22px] leading-none ${s.attention ? "text-pink-deep" : ""}`}>{s.attention}</dd>
                    </div>
                    <div>
                      <dt className="eyebrow">Pages</dt>
                      <dd className="tabular mt-1 text-[22px] leading-none">{pages}</dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
