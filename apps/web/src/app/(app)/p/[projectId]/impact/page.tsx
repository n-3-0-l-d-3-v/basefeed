import type { Metadata } from "next";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import { getProject, getProjectComments } from "@/lib/data";
import { duration, impact } from "@/lib/impact";

export const metadata: Metadata = { title: "Impact" };

function Card({ title, instead, children }: { title: string; instead: string; children: ReactNode }) {
  return (
    <section className="flex flex-col rounded-xl bg-panel p-5 ring-1 ring-line">
      <h2 className="text-[15px] font-medium">{title}</h2>
      <div className="mt-4 flex-1">{children}</div>
      <p className="mt-5 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
        <span className="font-medium text-ink-2">Instead of</span> {instead}
      </p>
    </section>
  );
}

function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: "pink" }) {
  return (
    <div className="flex flex-col-reverse justify-end gap-1.5">
      <dt className="text-[12px] leading-snug text-muted">{label}</dt>
      <dd className={`tabular text-[26px] leading-none ${tone === "pink" ? "text-pink-deep" : ""}`}>{value}</dd>
    </div>
  );
}

export default async function ImpactPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await getProject(projectId);
  const i = impact(await getProjectComments(projectId));
  const flagged = i.flags.vague + i.flags.duplicate + i.flags.priority + i.flags.newWork;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6">
      <div className="mb-6 mt-2">
        <p className="eyebrow text-[14px] text-pink-text!">(what the tool handled)</p>
        <h2 className="mt-1 text-[28px] font-normal leading-tight tracking-[-0.03em]">
          {i.total} {i.total === 1 ? "comment" : "comments"} on {project.name}, and the steps nobody had to do by hand
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
          Counted from this project&apos;s own comments. Each number is a step a person would otherwise do; nothing here is an estimate.
        </p>
      </div>

      {i.total === 0 ? (
        <div className="rounded-xl bg-panel ring-1 ring-line">
          <EmptyState title="Nothing to count yet">Once comments come in, this page shows what was captured, sorted, detected and signed off automatically.</EmptyState>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="Context captured with the comment" instead='asking "which page, which element, on what device?"'>
            <dl className="grid grid-cols-2 gap-4">
              <Stat value={`${i.withContext}/${i.total}`} label="arrived with element, Webflow classes, device and screen size" />
              <Stat value={i.pins.onElement} label="pins still on their exact element after page edits" />
            </dl>
          </Card>

          <Card title="Sorted before anyone read them" instead="reading, titling and prioritising every comment one by one">
            <dl className="grid grid-cols-2 gap-4">
              <Stat value={i.labelled} label="given a clear title and category" />
              <Stat value={flagged} label="flagged because they needed a decision" tone={flagged ? "pink" : undefined} />
            </dl>
            {flagged + i.flags.copy > 0 && (
              <ul className="mt-4 space-y-1 text-[13px] text-ink-2">
                {i.flags.vague > 0 && <li>{i.flags.vague} too vague to act on, with a question ready to send</li>}
                {i.flags.duplicate > 0 && <li>{i.flags.duplicate} duplicate of an earlier comment</li>}
                {i.flags.priority > 0 && <li>{i.flags.priority} filed at the wrong priority</li>}
                {i.flags.newWork > 0 && <li>{i.flags.newWork} new work rather than a tweak</li>}
                {i.flags.copy > 0 && <li>{i.flags.copy} exact text {i.flags.copy === 1 ? "change" : "changes"} extracted, ready to paste</li>}
              </ul>
            )}
          </Card>

          <Card title="Fixes noticed without re-checking" instead="reopening every comment after a publish to see whether it was done, and proofing pages by eye">
            <dl className="grid grid-cols-3 gap-4">
              <Stat value={i.pageCheck} label="problems found by the page check" />
              <Stat value={i.fixesSpotted} label="commented elements seen to change afterwards" />
              <Stat value={i.pins.flagged} label="elements changed or removed, flagged rather than guessed" tone={i.pins.flagged ? "pink" : undefined} />
            </dl>
          </Card>

          <Card title="Client sign-off" instead="messaging the client that it's done, then waiting and chasing">
            <dl className="grid grid-cols-3 gap-4">
              <Stat value={i.signOff.confirmed} label="confirmed by the client" />
              <Stat value={i.signOff.waiting} label="waiting on the client" />
              <Stat value={i.signOff.sentBack} label="sent back and reopened" tone={i.signOff.sentBack ? "pink" : undefined} />
            </dl>
          </Card>

          <section className="grid gap-4 rounded-xl bg-night p-5 text-white sm:col-span-2 sm:grid-cols-3">
            <dl className="grid grid-cols-2 gap-4 sm:col-span-2">
              <div className="flex flex-col-reverse justify-end gap-1.5">
                <dt className="text-[12px] text-white/60">resolved</dt>
                <dd className="tabular text-[26px] leading-none">
                  {i.resolved}/{i.total}
                </dd>
              </div>
              <div className="flex flex-col-reverse justify-end gap-1.5">
                <dt className="text-[12px] text-white/60">typical time from comment to resolved</dt>
                <dd className="tabular text-[26px] leading-none">{i.medianHoursToResolve === null ? "–" : duration(i.medianHoursToResolve)}</dd>
              </div>
            </dl>
            <p className="text-[12px] leading-relaxed text-white/60">
              Time to resolve is measured, not projected. Compare it across projects to see whether rounds are getting shorter.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
