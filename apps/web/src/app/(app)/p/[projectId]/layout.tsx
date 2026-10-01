import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getProject } from "@/lib/data";
import { ProjectTabs } from "./tabs";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project } = await getProject(projectId);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 pt-4 sm:px-5">
        <Link href="/" aria-label="All projects" className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink [&_svg]:size-4">
          <ArrowLeft />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-medium leading-tight">{project.name}</h1>
          {project.site_url && <p className="truncate font-mono text-[11px] text-muted">{project.site_url.replace(/^https?:\/\//, "")}</p>}
        </div>
        <ProjectTabs projectId={project.id} />
      </div>
      {children}
    </div>
  );
}
