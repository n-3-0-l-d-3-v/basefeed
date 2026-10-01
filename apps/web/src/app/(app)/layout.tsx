import { LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { getSession } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, workspaces } = await getSession();
  const initial = (profile.name || profile.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 bg-bg px-3 pt-3">
        <div className="flex h-12 items-center gap-6 rounded-xl bg-night pl-4 pr-2 text-white shadow-[var(--shadow-soft)]">
          <Link href="/" className="flex items-baseline gap-2" aria-label="Basenine Feedback, all projects">
            <span className="text-[15px] font-bold tracking-[-0.01em]">BASENINE</span>
            <span className="font-pixel text-[13px] text-accent">Feedback</span>
          </Link>
          <nav className="hidden items-center gap-5 text-[13px] text-white/70 sm:flex">
            <Link href="/" className="hover:text-white">
              Projects
            </Link>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-[12px] text-white/45 md:inline" title="Workspace">
              {workspaces[0]?.name}
            </span>
            <span className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1" title={profile.email}>
              <span aria-hidden className="grid size-6 place-items-center rounded-full bg-pink text-[12px] font-bold text-plum">
                {initial}
              </span>
              <span className="hidden truncate text-[13px] sm:inline">{profile.name}</span>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white [&_svg]:size-4"
              >
                <LogOut />
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
