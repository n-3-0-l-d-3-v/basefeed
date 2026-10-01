import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/data";
import { originOf } from "@/lib/urls";
import { signWidgetToken } from "@/lib/widget/token";
import { buttonClass } from "@/components/ui";
import { HandBack } from "./hand-back";

export const metadata: Metadata = { title: "Connect" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-panel p-7 text-[14px] shadow-[var(--shadow-pop)]">
        <p className="mb-5 flex items-baseline gap-2"><span className="text-[15px] font-bold tracking-[-0.01em]">BASENINE</span><span className="font-pixel text-[13px] text-pink-deep">Feedback</span></p>
        {children}
      </div>
    </main>
  );
}

/**
 * Opened as a popup by the widget on a client site. Mints a token for this signed-in member, scoped
 * to exactly the requesting origin, and posts it back only to that origin.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ pk?: string; origin?: string }> }) {
  const { pk = "", origin: rawOrigin = "" } = await searchParams;
  const origin = originOf(rawOrigin);
  if (!/^pk_[a-f0-9]{24}$/.test(pk) || !origin || origin !== rawOrigin) return <Shell>This sign-in link is malformed. Close this window and try again.</Shell>;

  const { supabase, user, profile } = await getSession();
  const { data: project } = await supabase.from("projects").select("id, name, allowed_origins").eq("public_key", pk).maybeSingle();
  if (!project)
    return (
      <Shell>
        <p>
          You&apos;re signed in as <strong>{profile.email}</strong>, which doesn&apos;t have access to this project.
        </p>
      </Shell>
    );

  if (!project.allowed_origins.includes(origin)) {
    async function allow() {
      "use server";
      const { supabase } = await getSession();
      const { data: p } = await supabase.from("projects").select("allowed_origins").eq("id", project!.id).single();
      if (p && !p.allowed_origins.includes(origin!)) await supabase.from("projects").update({ allowed_origins: [...p.allowed_origins, origin!] }).eq("id", project!.id);
      revalidatePath("/widget/connect");
    }
    return (
      <Shell>
        <p className="font-semibold">Connect this site to {project.name}?</p>
        <p className="mt-2 break-all rounded-sm bg-sunken px-2 py-1 font-mono text-xs">{origin}</p>
        <p className="mt-3 text-muted">Only allow this if it&apos;s a site your team builds (e.g. its staging or live domain). Anyone on your team will then be able to leave feedback there.</p>
        <form action={allow} className="mt-5 flex justify-end">
          <button type="submit" className={buttonClass("primary")}>
            Connect site
          </button>
        </form>
      </Shell>
    );
  }

  const token = await signWidgetToken({ sub: user.id, kind: "member", pid: project.id, org: origin, name: profile.name || "Team" });
  return (
    <Shell>
      <HandBack token={token} pk={pk} origin={origin} projectName={project.name} />
    </Shell>
  );
}
