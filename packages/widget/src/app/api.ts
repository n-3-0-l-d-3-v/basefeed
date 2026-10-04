import type { Anchor } from "@bn/anchor";
import type { AnchorReport, CreateCommentInput, Status, WidgetAttachment, WidgetComment, WidgetMe, WidgetReply } from "@bn/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Api {
  constructor(
    private readonly origin: string,
    private readonly token: () => string | null,
    private readonly onUnauthorized: () => void,
  ) {}

  private async req<T>(method: string, path: string, body?: unknown, file?: File): Promise<T> {
    const t = this.token();
    if (!t) throw new ApiError(401, "Not signed in");
    let res: Response;
    try {
      res = await fetch(`${this.origin}/api/widget${path}`, {
        method,
        mode: "cors",
        credentials: "omit",
        headers: { authorization: `Bearer ${t}`, ...(file ? { "content-type": file.type } : body ? { "content-type": "application/json" } : {}) },
        body: file ?? (body ? JSON.stringify(body) : undefined),
      });
    } catch {
      throw new ApiError(0, "Can't reach the feedback server. Check your connection.");
    }
    if (res.status === 401) {
      this.onUnauthorized();
      throw new ApiError(401, "Your feedback session expired. Sign in again.");
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, j.error ?? `Request failed (${res.status})`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  me() {
    return this.req<WidgetMe>("GET", "/me");
  }

  comments(url: string) {
    return this.req<{ comments: WidgetComment[] }>("GET", `/comments?url=${encodeURIComponent(url)}`);
  }

  create(input: CreateCommentInput) {
    return this.req<{ comment: WidgetComment }>("POST", "/comments", input);
  }

  reply(id: string, body: string) {
    return this.req<{ reply: WidgetReply }>("POST", `/comments/${id}/replies`, { body });
  }

  setStatus(id: string, status: Status) {
    return this.req<void>("PATCH", `/comments/${id}`, { status });
  }

  attach(id: string, file: File) {
    return this.req<{ attachment: WidgetAttachment }>("POST", `/comments/${id}/attachments?name=${encodeURIComponent(file.name)}`, undefined, file);
  }

  review(id: string, approved: boolean, note?: string) {
    return this.req<void>("POST", `/comments/${id}/review`, { approved, note });
  }

  repin(id: string, anchor: Anchor) {
    return this.req<void>("PATCH", `/comments/${id}`, { anchor });
  }

  report(reports: AnchorReport["reports"]) {
    return this.req<void>("POST", "/anchor-report", { reports });
  }
}
