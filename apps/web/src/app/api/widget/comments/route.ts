import { CreateCommentSchema, QA_RULES, type Json } from "@bn/shared";
import { after, NextResponse } from "next/server";
import { attachmentsByComment, repliesByComment, storeScreenshot, toWidgetComment, WIDGET_COMMENT_COLUMNS } from "@/lib/comments";
import { drainJobs, enqueueTriage } from "@/lib/jobs";
import { normalizePageUrl, originOf } from "@/lib/urls";
import { HttpError, preflight, readJson, requireMember, widgetRoute } from "@/lib/widget/route";

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
  const ids = rows.map((r) => r.id);
  const [replies, files] = await Promise.all([repliesByComment(admin, ids), attachmentsByComment(admin, ids)]);
  return NextResponse.json({ comments: rows.map((r) => toWidgetComment(r, replies.get(r.id) ?? [], claims.sub, files.get(r.id))) });
});

export const POST = widgetRoute(async (ctx) => {
  const { req, claims, project, admin } = ctx;
  const input = CreateCommentSchema.parse(await readJson(req));
  // Page-check findings are filed by the team, and their label comes from the rule, not from AI.
  const rule = input.context.qa ? QA_RULES[input.context.qa] : null;
  if (rule) requireMember(ctx);
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
      priority: rule?.priority ?? input.priority,
      ...(rule ? { title: rule.title, category: rule.category, triage_state: "dismissed" } : {}),
      anchor: input.anchor as unknown as Json,
      snapshot: input.snapshot as unknown as Json,
      context: input.context as unknown as Record<string, Json>,
      anchor_state: "attached",
    })
    .select(WIDGET_COMMENT_COLUMNS)
    .single();
  if (error) throw error;

  if (input.screenshot) await storeScreenshot(admin, project.id, row.id, input.screenshot);
  if (rule) {
    // A batch of findings should not send the team a batch of emails.
    await admin.from("jobs").delete().eq("idempotency_key", `notify:created:${row.id}`);
    return NextResponse.json({ comment: toWidgetComment(row, [], claims.sub) }, { status: 201 });
  }
  await enqueueTriage(row.id);
  // Triage + the team notification (queued by a database trigger) run after the response is sent.
  after(() => drainJobs());

  return NextResponse.json({ comment: toWidgetComment(row, [], claims.sub) }, { status: 201 });
});
