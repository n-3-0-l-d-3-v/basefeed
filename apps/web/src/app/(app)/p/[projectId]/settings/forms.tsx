"use client";

import { Ago } from "@/components/ago";
import { useState, useTransition } from "react";
import { Badge, Button, Field, Input, Select } from "@/components/ui";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { ASSIGN_CATEGORIES } from "@/lib/assign-categories";
import { createShareLink, createWebhook, deleteWebhook, revokeShareLink, setAssignRule, setOrigins, setReminderDays, testWebhook, updateProject } from "../../../actions";

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
  // Fixed at mount: "expired" doesn't need to tick while the page is open.
  const [now] = useState(() => Date.now());
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
            const expired = l.expires_at && Date.parse(l.expires_at) < now;
            const state = l.revoked_at ? "off" : expired ? "expired" : "active";
            return (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{l.label || "Untitled link"}</span>
                <span className="hidden text-xs text-muted sm:inline">created <Ago iso={l.created_at} /></span>
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

const REMINDER_CHOICES = [1, 2, 3, 5, 7, 14];

export function ReminderSetting({ projectId, days }: { projectId: string; days: number | null }) {
  const [value, setValue] = useState(days);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-4 text-[13px]">
      <label htmlFor="reminder-days" className="min-w-0 flex-1">
        <span className="block font-medium">Remind a client who has not confirmed a fix</span>
        <span className="block text-[12px] text-muted">One email for everything of theirs that is waiting. Sent once, and noted in each comment&apos;s history.</span>
      </label>
      <Select
        id="reminder-days"
        className="w-40"
        disabled={pending}
        value={value ?? ""}
        onChange={(e) => {
          const next = e.target.value ? Number(e.target.value) : null;
          const before = value;
          setValue(next);
          setSaved(false);
          start(async () => {
            const r = await setReminderDays(projectId, next);
            if (!r.ok) {
              setValue(before);
              return setError(r.error);
            }
            setError(null);
            setSaved(true);
          });
        }}
      >
        <option value="">Never</option>
        {[...new Set([...REMINDER_CHOICES, ...(days ? [days] : [])])].sort((a, b) => a - b).map((d) => (
          <option key={d} value={d}>
            After {d} {d === 1 ? "day" : "days"}
          </option>
        ))}
      </Select>
      <Status error={error} saved={saved} />
    </div>
  );
}

export function AssignRules({ projectId, members, rules }: { projectId: string; members: { id: string; name: string }[]; rules: { category: string; assignee_id: string }[] }) {
  const [chosen, setChosen] = useState<Record<string, string>>(() => Object.fromEntries(rules.map((r) => [r.category, r.assignee_id])));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const change = (category: string, assigneeId: string) => {
    const before = chosen[category] ?? "";
    setChosen((c) => ({ ...c, [category]: assigneeId }));
    setSaved(false);
    start(async () => {
      const r = await setAssignRule(projectId, category, assigneeId || null);
      if (!r.ok) {
        setChosen((c) => ({ ...c, [category]: before }));
        return setError(r.error);
      }
      setError(null);
      setSaved(true);
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-line">
        {Object.entries(ASSIGN_CATEGORIES).map(([id, c]) => (
          <li key={id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 text-[13px]">
            <label htmlFor={`rule-${id}`} className="min-w-0 flex-1">
              <span className="block font-medium">{c.label}</span>
              <span className="block text-[12px] text-muted">{c.hint}</span>
            </label>
            <Select id={`rule-${id}`} className="w-44" disabled={pending} value={chosen[id] ?? ""} onChange={(e) => change(id, e.target.value)}>
              <option value="">Nobody</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
      <Status error={error} saved={saved} />
    </div>
  );
}

type Hook = { id: string; url: string; secret: string; events: string[]; last_status: number | null; last_error: string | null; last_delivered_at: string | null };

export function Webhooks({ projectId, hooks }: { projectId: string; hooks: Hook[] }) {
  const all = Object.keys(WEBHOOK_EVENTS);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(all);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createWebhook(projectId, url, events);
            if (!r.ok) return setError(r.error);
            setError(null);
            setUrl("");
            setEvents(all);
          });
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Field label="Webhook URL" htmlFor="hook-url">
              <Input id="hook-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" maxLength={2048} />
            </Field>
          </div>
          <Button type="submit" variant="primary" disabled={pending || !url.trim()}>
            Add webhook
          </Button>
        </div>
        <fieldset className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          <legend className="eyebrow mb-1.5">Send when</legend>
          {Object.entries(WEBHOOK_EVENTS).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={events.includes(id)} onChange={(e) => setEvents((list) => (e.target.checked ? [...list, id] : list.filter((x) => x !== id)))} />
              {label}
            </label>
          ))}
        </fieldset>
      </form>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {hooks.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-line">
          {hooks.map((h) => {
            const state = tested[h.id] ?? (!h.last_delivered_at ? "Nothing sent yet" : h.last_error ? `Last delivery failed: ${h.last_error}` : null);
            return (
              <li key={h.id} className="flex flex-col gap-2 px-3 py-2.5 text-[13px]">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[12px]">{h.url}</span>
                    <span className="block text-[12px] text-muted">
                      {h.events.length ? `${h.events.length} of ${all.length} events` : "All events"} · {state ?? <>Last delivered <Ago iso={h.last_delivered_at!} /></>}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-2 hover:bg-sunken"
                    onClick={() =>
                      start(async () => {
                        const r = await testWebhook(projectId, h.id);
                        setTested((t) => ({ ...t, [h.id]: !r.ok ? r.error : r.data.error ? `Test failed: ${r.data.error}` : `Test delivered (HTTP ${r.data.status})` }));
                      })
                    }
                  >
                    Send test
                  </button>
                  <button type="button" className="rounded-md px-2 py-1 text-[12px] font-medium text-ink-2 hover:bg-sunken" onClick={() => setRevealed(revealed === h.id ? null : h.id)}>
                    {revealed === h.id ? "Hide secret" : "Signing secret"}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-danger-soft hover:text-danger"
                    onClick={() =>
                      start(async () => {
                        const r = await deleteWebhook(projectId, h.id);
                        if (!r.ok) setError(r.error);
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                {revealed === h.id && (
                  <p className="text-[12px] text-muted">
                    Each request carries <span className="font-mono text-ink-2">X-Basenine-Signature: sha256=…</span>, the HMAC-SHA256 of the body with this secret:{" "}
                    <span className="break-all font-mono text-ink-2">{h.secret}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
