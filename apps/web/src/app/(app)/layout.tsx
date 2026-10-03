import { LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { CommandPalette, SearchButton } from "@/components/command-palette";
import { getSession } from "@/lib/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, workspaces } = await getSession();
  const initial = (profile.name || profile.email || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col">
      {/* Same floating bar as basenine.co: translucent ink, hairline border, blur, centred. */}
      <header className="pointer-events-none sticky top-4 z-30 mt-4 px-3">
        <div className="pointer-events-auto mx-auto flex h-[52px] w-full max-w-[55rem] items-center gap-8 rounded-xl border border-[rgb(153_153_153/0.3)] bg-[rgb(10_10_10/0.8)] pl-5 pr-2 text-white shadow-[var(--shadow-soft)] backdrop-blur-[5px]">
          <Link href="/" className="flex items-baseline gap-2" aria-label="Basenine Feedback, all projects">
            <span className="text-[16px] font-black tracking-[-0.02em]">BASENINE</span>
            <span className="font-pixel text-[13px] text-accent">Feedback</span>
          </Link>
          <nav className="hidden items-center gap-8 text-[0.8rem] font-medium leading-tight sm:flex">
            <Link href="/" className="hover:text-white/65">
              Projects
            </Link>
            <Link href="/account" className="hover:text-white/65">
              Account
            </Link>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-3">
            <SearchButton />
            <span className="hidden truncate text-[12px] text-white/45 lg:inline" title="Workspace">
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
      <CommandPalette />
    </div>
  );
}
