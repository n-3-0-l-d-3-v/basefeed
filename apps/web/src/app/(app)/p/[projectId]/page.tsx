import type { Metadata } from "next";
import { getMembers, getProject, getProjectComments } from "@/lib/data";
import { env } from "@/lib/env";
import { Canvas } from "./canvas";

export const metadata: Metadata = { title: "Canvas" };

export default async function CanvasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, pages } = await getProject(projectId);
  const [comments, members] = await Promise.all([getProjectComments(projectId), getMembers(project.workspace_id)]);
  return <Canvas project={project} pages={pages} initialComments={comments} members={members} appUrl={env().APP_URL} />;
}
