import type { Metadata } from "next";
import { getMembers, getProject, getProjectComments } from "@/lib/data";
import { Board } from "./board";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, pages } = await getProject(projectId);
  const [comments, members] = await Promise.all([getProjectComments(projectId), getMembers(project.workspace_id)]);
  return <Board projectId={project.id} pages={pages} initialComments={comments} members={members} />;
}
