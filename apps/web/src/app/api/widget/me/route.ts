import type { WidgetMe } from "@bn/shared";
import { NextResponse } from "next/server";
import { preflight, widgetRoute } from "@/lib/widget/route";

export const OPTIONS = preflight;

export const GET = widgetRoute(async ({ claims, project }) => {
  const me: WidgetMe = {
    name: claims.name,
    kind: claims.kind,
    canModerate: claims.kind === "member",
    project: { name: project.name },
  };
  return NextResponse.json(me);
});
