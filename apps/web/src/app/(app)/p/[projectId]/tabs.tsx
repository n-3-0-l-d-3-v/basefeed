"use client";

import { Gauge, KanbanSquare, MousePointerClick, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function ProjectTabs({ projectId }: { projectId: string }) {
  const path = usePathname();
  const base = `/p/${projectId}`;
  const tabs = [
    { href: base, label: "Canvas", icon: MousePointerClick, active: path === base },
    { href: `${base}/board`, label: "Board", icon: KanbanSquare, active: path.startsWith(`${base}/board`) },
    { href: `${base}/impact`, label: "Impact", icon: Gauge, active: path.startsWith(`${base}/impact`) },
    { href: `${base}/settings`, label: "Settings", icon: Settings2, active: path.startsWith(`${base}/settings`) },
  ];
  return (
    <nav aria-label="Project" className="ml-auto inline-flex rounded-[10px] bg-sunken p-0.5 ring-1 ring-inset ring-line">
      {tabs.map(({ href, label, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cx(
            "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors [&_svg]:size-3.5",
            active ? "bg-panel text-ink shadow-[var(--shadow-soft)] ring-1 ring-line" : "text-muted hover:text-ink",
          )}
        >
          <Icon aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}
