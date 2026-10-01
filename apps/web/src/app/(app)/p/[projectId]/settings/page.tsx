import type { Metadata } from "next";
import { InstallSnippet } from "@/components/install-snippet";
import { getProject, getSession } from "@/lib/data";
import { env } from "@/lib/env";
import { OriginsForm, ProjectForm, ShareLinks } from "./forms";

export const metadata: Metadata = { title: "Settings" };

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

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ welcome?: string }> }) {
  const [{ projectId }, { welcome }] = await Promise.all([params, searchParams]);
  const { project } = await getProject(projectId);
  const { supabase } = await getSession();
  const { data: links } = await supabase
    .from("share_links")
    .select("id, label, created_at, expires_at, revoked_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 pb-16 pt-1">
      {welcome && (
        <div className="rounded-xl bg-night px-5 py-4 text-white">
          <p className="font-pixel text-[12px] text-accent">Project created. One step left</p>
          <p className="mt-1 text-[14px]">Add the script below to the site, publish, then open the Canvas.</p>
        </div>
      )}
      <Section
        title="Install"
        description={
          <>
            One line in Webflow&apos;s footer code. Visitors never see it: it stays dormant until feedback mode is switched on, and the full widget loads only then.
          </>
        }
      >
        <InstallSnippet appUrl={env().APP_URL} publicKey={project.public_key} />
        <p className="mt-3 text-xs text-muted">
          Test it: open{" "}
          <a className="font-mono underline" href={`${project.site_url}?bn_feedback=1`} target="_blank" rel="noreferrer">
            {project.site_url?.replace(/^https?:\/\//, "")}?bn_feedback=1
          </a>
        </p>
      </Section>
      <Section title="Connected sites" description="Feedback is only accepted from these origins, e.g. the webflow.io staging domain and the live domain. Removing one cuts off access immediately.">
        <OriginsForm projectId={project.id} initial={project.allowed_origins} />
      </Section>
      <Section
        title="Client access"
        description="Share a link so clients can comment with just their name and email: no account, no password. Turn a link off at any time."
      >
        <ShareLinks projectId={project.id} links={links ?? []} />
      </Section>
      <Section title="Project" description="Name and the Figma file the site is built from.">
        <ProjectForm projectId={project.id} name={project.name} figmaUrl={project.figma_url} />
      </Section>
    </main>
  );
}
