import { CreateCommentSchema, type Json } from "@bn/shared";
import { after, NextResponse } from "next/server";
import { repliesByComment, storeScreenshot, toWidgetComment, WIDGET_COMMENT_COLUMNS } from "@/lib/comments";
import { drainJobs, enqueueTriage } from "@/lib/jobs";
import { normalizePageUrl, originOf } from "@/lib/urls";
import { HttpError, preflight, readJson, widgetRoute } from "@/lib/widget/route";

export const OPTIONS = preflight;

export const GET = widgetRoute(async ({ req, claims, project, admin }) => {
  const url = normalizePageUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!url || originOf(url) !== claims.org) throw new HttpError(400, "That page isn't on this site");

  const { data: page } = await admin.from("pages").select("id").eq("project_id", project.id).eq("url", url).maybeSingle();
  if (!page) return NextResponse.json({ comments: [] });

  const { data: rows, error } = await admin
    .from("comments")
    .select(WIDGET_COMMENT_COLUMNS)
    .eq("page_id", page.id)
    .order("number");
  if (error) throw error;
  const replies = await repliesByComment(admin, rows.map((r) => r.id));
  return NextResponse.json({ comments: rows.map((r) => toWidgetComment(r, replies.get(r.id) ?? [])) });
});

export const POST = widgetRoute(async ({ req, claims, project, admin }) => {
  const input = CreateCommentSchema.parse(await readJson(req));
  const url = normalizePageUrl(input.context.url);
  if (!url || originOf(url) !== claims.org) throw new HttpError(400, "That page isn't on this site");

  // Create the page on first comment, but never rename one the team already named.
  const { error: pageError } = await admin
    .from("pages")
    .upsert({ project_id: project.id, url, title: input.context.title.slice(0, 160), kind: "live" }, { onConflict: "project_id,url", ignoreDuplicates: true });
  if (pageError) throw pageError;
  const { data: page } = await admin.from("pages").select("id").eq("project_id", project.id).eq("url", url).single().throwOnError();

  const { data: row, error } = await admin
    .from("comments")
    .insert({
      project_id: project.id,
      page_id: page.id,
      author_user_id: claims.kind === "member" ? claims.sub : null,
      author_guest_id: claims.kind === "guest" ? claims.sub : null,
      author_name: claims.name,
      body: input.body,
      priority: input.priority,
      anchor: input.anchor as unknown as Json,
      snapshot: input.snapshot as unknown as Json,
      context: input.context as unknown as Record<string, Json>,
      anchor_state: "attached",
    })
    .select(WIDGET_COMMENT_COLUMNS)
    .single();
  if (error) throw error;

  if (input.screenshot) await storeScreenshot(admin, project.id, row.id, input.screenshot);
  await enqueueTriage(row.id);
  // Triage + the team notification (queued by a database trigger) run after the response is sent.
  after(() => drainJobs());

  return NextResponse.json({ comment: toWidgetComment(row, []) }, { status: 201 });
});
