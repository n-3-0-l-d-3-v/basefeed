"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardComment } from "@/lib/data";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** Project comments kept live over Supabase Realtime (row-level security applies to the stream too). */
export function useLiveComments(projectId: string, initial: DashboardComment[]) {
  const [comments, setComments] = useState(initial);

  // New server data (navigation, revalidation) replaces the list.
  const [source, setSource] = useState(initial);
  if (source !== initial) {
    setSource(initial);
    setComments(initial);
  }

  const upsert = useCallback(
    (row: DashboardComment) =>
      setComments((list) => {
        const i = list.findIndex((c) => c.id === row.id);
        if (i === -1) return [row, ...list].sort((a, b) => b.number - a.number);
        const next = list.slice();
        next[i] = { ...next[i], ...row };
        return next;
      }),
    [],
  );

  useEffect(() => {
    const sb = supabaseBrowser();
    let channel: ReturnType<typeof sb.channel> | null = null;
    let cancelled = false;
    // Authenticate the socket before joining: an anonymous join is filtered to nothing by RLS.
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) void sb.realtime.setAuth(data.session.access_token);
      channel = subscribe();
    });
    const subscribe = () =>
      sb
      .channel(`comments:${projectId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `project_id=eq.${projectId}` }, (p) =>
        upsert(p.new as DashboardComment),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "comments", filter: `project_id=eq.${projectId}` }, (p) =>
        upsert(p.new as DashboardComment),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "comments" }, (p) => {
        const id = (p.old as { id?: string }).id;
        if (id) setComments((list) => list.filter((c) => c.id !== id));
      })
      .subscribe();
    return () => {
      cancelled = true;
      if (channel) void sb.removeChannel(channel);
    };
  }, [projectId, upsert]);

  const patch = useCallback((id: string, partial: Partial<DashboardComment>) => {
    setComments((list) => list.map((c) => (c.id === id ? { ...c, ...partial } : c)));
  }, []);

  const remove = useCallback((id: string) => setComments((list) => list.filter((c) => c.id !== id)), []);

  return { comments, patch, remove, upsert };
}

/** Comments that need a human look even if nobody touched them: element gone/changed, or the page changed under them. */
export function needsAttention(c: DashboardComment): boolean {
  if (c.status === "resolved") return false;
  return c.anchor_state === "detached" || c.anchor_state === "suggested" || (c.change_summary?.changes.length ?? 0) > 0 || !!c.triage?.needsClarification;
}
