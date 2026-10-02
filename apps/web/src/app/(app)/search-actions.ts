"use server";

import { getSession } from "@/lib/data";

export type SearchHit =
  | { kind: "project"; id: string; title: string; sub: string; href: string }
  | { kind: "page"; id: string; title: string; sub: string; href: string }
  | { kind: "comment"; id: string; title: string; sub: string; href: string; number: number; status: string };

/** Escape LIKE wildcards so a search for "50%" means the text "50%". */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function search(raw: string): Promise<SearchHit[]> {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2 && !/^#?\d+$/.test(q)) return [];
  const { supabase } = await getSession();
  const number = /^#?(\d{1,6})$/.exec(q)?.[1];
  const pattern = like(q);

  const [projects, pages, byBody, byTitle, byNumber] = await Promise.all([
    supabase.from("projects").select("id, name, site_url").ilike("name", pattern).is("archived_at", null).limit(5),
    supabase.from("pages").select("id, title, url, project_id, projects(name)").ilike("title", pattern).limit(6),
    supabase.from("comments").select("id, number, body, title, status, project_id, page_id, projects(name)").ilike("body", pattern).order("created_at", { ascending: false }).limit(8),
    supabase.from("comments").select("id, number, body, title, status, project_id, page_id, projects(name)").ilike("title", pattern).order("created_at", { ascending: false }).limit(8),
    number
      ? supabase.from("comments").select("id, number, body, title, status, project_id, page_id, projects(name)").eq("number", Number(number)).limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  const hits: SearchHit[] = [];
  for (const p of projects.data ?? [])
    hits.push({ kind: "project", id: p.id, title: p.name, sub: p.site_url?.replace(/^https?:\/\//, "") ?? "", href: `/p/${p.id}` });
  for (const p of pages.data ?? [])
    hits.push({
      kind: "page",
      id: p.id,
      title: p.title || p.url,
      sub: (p.projects as unknown as { name: string } | null)?.name ?? "",
      href: `/p/${p.project_id}?page=${p.id}`,
    });
  const seen = new Set<string>();
  for (const c of [...(byNumber.data ?? []), ...(byTitle.data ?? []), ...(byBody.data ?? [])]) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    hits.push({
      kind: "comment",
      id: c.id,
      number: c.number,
      status: c.status,
      title: c.title ?? c.body,
      sub: (c.projects as unknown as { name: string } | null)?.name ?? "",
      href: `/p/${c.project_id}?page=${c.page_id}&c=${c.id}`,
    });
  }
  return hits.slice(0, 20);
}
