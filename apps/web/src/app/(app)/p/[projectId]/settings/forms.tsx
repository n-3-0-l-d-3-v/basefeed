"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { ago } from "@/lib/export";
import { createShareLink, revokeShareLink, setOrigins, updateProject } from "../../../actions";

function Status({ error, saved }: { error: string | null; saved: boolean }) {
  if (error)
    return (
      <p role="alert" className="text-xs text-danger">
        {error}
      </p>
    );
  return saved ? (
    <p role="status" className="text-xs text-muted">
      Saved.
    </p>
  ) : null;
}

export function OriginsForm({ projectId, initial }: { projectId: string; initial: string[] }) {
  const [origins, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const save = (next: string[]) =>
    start(async () => {
      setSaved(false);
      const r = await setOrigins(projectId, next);
      if (!r.ok) return setError(r.error);
      setError(null);
      setList(r.data);
      setDraft("");
      setSaved(true);
    });

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-line">
        {origins.map((o) => (
          <li key={o} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="truncate font-mono text-xs">{o}</span>
            <button
              type="button"
              disabled={pending || origins.length === 1}
              onClick={() => save(origins.filter((x) => x !== o))}
              className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) save([...origins, draft.trim()]);
        }}
      >
        <Input aria-label="Add site" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://www.acme.com" type="url" />
        <Button type="submit" disabled={pending || !draft.trim()}>
          Add
        </Button>
      </form>
      <Status error={error} saved={saved} />
    </div>
  );
}

type Link = { id: string; label: string; created_at: string; expires_at: string | null; revoked_at: string | null };

export function ShareLinks({ projectId, links }: { projectId: string; links: Link[] }) {
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("30");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createShareLink(projectId, label, days === "never" ? null : Number(days));
            if (!r.ok) return setError(r.error);
            setError(null);
            setFresh(r.data.url);
            setLabel("");
          });
        }}
      >
        <div className="min-w-48 flex-1">
          <Field label="Label" htmlFor="sl-label">
            <Input id="sl-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Acme marketing team" maxLength={80} />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Expires" htmlFor="sl-days">
            <Select id="sl-days" value={days} onChange={(e) => setDays(e.target.value)} className="h-10">
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
              <option value="never">Never</option>
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={pending}>
          Create link
        </Button>
      </form>

      {fresh && (
        <div className="rounded-lg bg-accent-soft p-3 ring-1 ring-inset ring-[#cfe9c6]">
          <p className="text-[13px]">Copy this link now. For security only a fingerprint is stored, so it can&apos;t be shown again.</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={fresh} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button
              variant="primary"
              onClick={async () => {
                await navigator.clipboard.writeText(fresh);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      {links.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-line">
          {links.map((l) => {
            const expired = l.expires_at && Date.parse(l.expires_at) < Date.now();
            const state = l.revoked_at ? "off" : expired ? "expired" : "active";
            return (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.label || "Untitled link"}</span>
                <span className="hidden text-xs text-muted sm:inline">created {ago(l.created_at)}</span>
                <Badge tone={state === "active" ? "accent" : "neutral"}>{state}</Badge>
                {state === "active" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await revokeShareLink(projectId, l.id);
                        if (!r.ok) setError(r.error);
                      })
                    }
                    className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-danger-soft hover:text-danger"
                  >
                    Turn off
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ProjectForm({ projectId, name, figmaUrl }: { projectId: string; name: string; figmaUrl: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      action={(form) =>
        start(async () => {
          setSaved(false);
          const r = await updateProject(projectId, { name: String(form.get("name") ?? ""), figmaUrl: String(form.get("figma") ?? "") || null });
          if (!r.ok) return setError(r.error);
          setError(null);
          setSaved(true);
        })
      }
    >
      <Field label="Name" htmlFor="pf-name">
        <Input id="pf-name" name="name" defaultValue={name} required maxLength={80} />
      </Field>
      <Field label="Figma file" htmlFor="pf-figma" hint="Linked from the Canvas so reviewers can compare with the design.">
        <Input id="pf-figma" name="figma" type="url" defaultValue={figmaUrl ?? ""} placeholder="https://www.figma.com/design/…" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        <Status error={error} saved={saved} />
      </div>
    </form>
  );
}
