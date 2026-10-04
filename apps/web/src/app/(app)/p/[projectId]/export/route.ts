import { commentsToCsv } from "@/lib/csv";
import { getMembers, getProject, getProjectComments } from "@/lib/data";
import { env } from "@/lib/env";

/** Every comment of the project as a CSV file, for a spreadsheet or a hand-off. Runs as the signed-in user. */
export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { project, pages } = await getProject(projectId);
  const [comments, members] = await Promise.all([getProjectComments(projectId), getMembers(project.workspace_id)]);
  const csv = commentsToCsv([...comments].reverse(), {
    pageUrl: (id) => pages.find((p) => p.id === id)?.url ?? "",
    memberName: (id) => members.find((m) => m.id === id)?.name ?? "",
    link: (c) => `${env().APP_URL}/p/${project.id}?page=${c.page_id}&c=${c.id}`,
  });
  const name = project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "feedback";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-feedback.csv"`,
      "cache-control": "no-store",
    },
  });
}
