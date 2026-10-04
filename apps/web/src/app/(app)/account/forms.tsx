"use client";

import { Ago } from "@/components/ago";
import { Check, Copy, KeyRound, Link2, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge, Button, cx, Field, IconButton, Input, Select } from "@/components/ui";
import type { Member } from "@/lib/data";
import { createApiToken, createInvite, removeMember, revokeApiToken, revokeInvite, setNotificationPref, updateProfile } from "./actions";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (text: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    },
  };
}

function Alert({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-[13px] text-danger">
      {error}
    </p>
  ) : null;
}

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-4"
      action={(f) =>
        start(async () => {
          setSaved(false);
          const r = await updateProfile(String(f.get("name") ?? ""));
          if (!r.ok) return setError(r.error);
          setError(null);
          setSaved(true);
        })
      }
    >
      <Field label="Name" htmlFor="acc-name">
        <Input id="acc-name" name="name" defaultValue={name} required maxLength={80} />
      </Field>
      <Field label="Email" htmlFor="acc-email" hint="Used for sign-in and notifications.">
        <Input id="acc-email" value={email} readOnly disabled />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        {saved && <span role="status" className="text-[13px] text-muted">Saved.</span>}
        <Alert error={error} />
      </div>
    </form>
  );
}

function Switch({ id, checked, onChange, label, description }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-6 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0">
      <span>
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[13px] text-muted">{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span aria-hidden className="h-6 w-10 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink" />
        <span aria-hidden className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

type PrefKey = "new_comments" | "daily_digest" | "assignments" | "replies";

export function NotificationToggles({ initial }: { initial: Record<PrefKey, boolean> }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = async (key: PrefKey, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    const r = await setNotificationPref(key, value);
    if (!r.ok) {
      setPrefs((p) => ({ ...p, [key]: !value }));
      setError(r.error);
    }
  };
  return (
    <div>
      <Switch id="np-new" checked={prefs.new_comments} onChange={(v) => void set("new_comments", v)} label="New comments" description="Someone comments on a project in your workspace." />
      {prefs.new_comments && (
        <Switch id="np-digest" checked={prefs.daily_digest} onChange={(v) => void set("daily_digest", v)} label="Once a day instead" description="New comments arrive as one email each morning (09:00 India time) instead of one per comment. Assignments and replies still arrive straight away." />
      )}
      <Switch id="np-assign" checked={prefs.assignments} onChange={(v) => void set("assignments", v)} label="Assigned to me" description="A comment is assigned to you." />
      <Switch id="np-replies" checked={prefs.replies} onChange={(v) => void set("replies", v)} label="Replies" description="Someone replies to your comment, or to one assigned to you." />
      <Alert error={error} />
    </div>
  );
}

type Team = { id: string; name: string; role: string; members: Member[] };
type Invite = { id: string; workspace_id: string; role: string; expires_at: string; revoked_at: string | null; created_at: string };

export function Team({ userId, teams, invites }: { userId: string; teams: Team[]; invites: Invite[] }) {
  const [role, setRole] = useState<"member" | "admin">("member");
  const [days, setDays] = useState(7);
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { copied, copy } = useCopy();

  return (
    <div className="flex flex-col gap-6">
      {teams.map((t) => {
        const isAdmin = t.role === "owner" || t.role === "admin";
        const active = invites.filter((i) => i.workspace_id === t.id && !i.revoked_at && Date.parse(i.expires_at) > Date.now());
        return (
          <div key={t.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-medium">{t.name}</h3>
              <Badge>{t.role === "owner" ? "You own this" : t.role}</Badge>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-line">
              {t.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span aria-hidden className="grid size-7 place-items-center rounded-full bg-pink text-[12px] font-bold text-plum">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">
                      {m.name}
                      {m.id === userId && <span className="text-muted"> (you)</span>}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{m.email}</span>
                  </span>
                  <Badge tone={m.role === "owner" ? "ink" : "neutral"}>{m.role}</Badge>
                  {isAdmin && m.id !== userId && m.role !== "owner" && (
                    <IconButton
                      aria-label={`Remove ${m.name}`}
                      className="hover:bg-danger-soft hover:text-danger"
                      onClick={() =>
                        start(async () => {
                          if (!confirm(`Remove ${m.name} from ${t.name}?`)) return;
                          const r = await removeMember(m.id);
                          if (!r.ok) setError(r.error);
                        })
                      }
                    >
                      <UserMinus />
                    </IconButton>
                  )}
                </li>
              ))}
            </ul>
            {isAdmin && (
              <>
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    start(async () => {
                      const r = await createInvite(role, days);
                      if (!r.ok) return setError(r.error);
                      setError(null);
                      setFresh(r.data.url);
                    });
                  }}
                >
                  <Field label="Role" htmlFor={`inv-role-${t.id}`}>
                    <Select id={`inv-role-${t.id}`} value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} className="h-10 w-36">
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </Select>
                  </Field>
                  <Field label="Works for" htmlFor={`inv-days-${t.id}`}>
                    <Select id={`inv-days-${t.id}`} value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-10 w-32">
                      <option value={1}>1 day</option>
                      <option value={7}>7 days</option>
                      <option value={30}>30 days</option>
                    </Select>
                  </Field>
                  <Button type="submit" variant="primary" disabled={pending}>
                    <Link2 aria-hidden />
                    Create invite link
                  </Button>
                </form>
                {active.length > 0 && (
                  <ul className="flex flex-col gap-1 text-[13px]">
                    {active.map((i) => (
                      <li key={i.id} className="flex items-center gap-2 text-muted">
                        <Badge>{i.role}</Badge>
                        <span>invite link, works until {new Date(i.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                        <button
                          type="button"
                          className="ml-auto rounded-md px-2 py-1 text-[12px] font-medium hover:bg-danger-soft hover:text-danger"
                          onClick={() =>
                            start(async () => {
                              const r = await revokeInvite(i.id);
                              if (!r.ok) setError(r.error);
                            })
                          }
                        >
                          Turn off
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        );
      })}
      {fresh && (
        <div className="rounded-lg bg-accent-soft p-3 ring-1 ring-inset ring-[#cfe9c6]">
          <p className="text-[13px]">Send this link to your teammate. It&apos;s shown once; create a new one any time.</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={fresh} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            <Button variant="primary" onClick={() => void copy(fresh)}>
              {copied === fresh ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied === fresh ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}
      <Alert error={error} />
    </div>
  );
}

type Token = { id: string; name: string; prefix: string; last_used_at: string | null; created_at: string; revoked_at: string | null };

export function ApiTokens({ tokens, appUrl }: { tokens: Token[]; appUrl: string }) {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { copied, copy } = useCopy();
  const endpoint = `${appUrl}/api/mcp`;
  const claudeCmd = `claude mcp add --transport http basenine-feedback ${endpoint} --header "Authorization: Bearer ${fresh ?? "<your token>"}"`;

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await createApiToken(name);
            if (!r.ok) return setError(r.error);
            setError(null);
            setFresh(r.data.token);
            setName("");
          });
        }}
      >
        <div className="min-w-56 flex-1">
          <Field label="Token name" htmlFor="tok-name">
            <Input id="tok-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Code on my laptop" maxLength={60} />
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
          <KeyRound aria-hidden />
          Create token
        </Button>
      </form>

      {fresh && (
        <div className="rounded-lg bg-accent-soft p-3 ring-1 ring-inset ring-[#cfe9c6]">
          <p className="text-[13px]">Copy your token now. Only a fingerprint is stored, so it can&apos;t be shown again.</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly value={fresh} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="New API token" />
            <Button variant="primary" onClick={() => void copy(fresh)}>
              {copied === fresh ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied === fresh ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="eyebrow">Connect Claude Code</p>
        <div className="flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-night px-3 py-2.5 font-mono text-[11px] leading-relaxed text-white/85">{claudeCmd}</pre>
          <IconButton aria-label="Copy command" onClick={() => void copy(claudeCmd)}>
            {copied === claudeCmd ? <Check /> : <Copy />}
          </IconButton>
        </div>
        <p className="text-[12px] text-muted">
          Cursor and other clients: add an HTTP MCP server at <span className="font-mono text-ink-2">{endpoint}</span> with the same Authorization header.
        </p>
      </div>

      {tokens.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-lg ring-1 ring-line">
          {tokens.map((t) => (
            <li key={t.id} className={cx("flex items-center gap-3 px-3 py-2.5 text-[13px]", t.revoked_at && "opacity-55")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.name}</span>
                <span className="block font-mono text-[11px] text-muted">
                  {t.prefix}… · {t.last_used_at ? <>used <Ago iso={t.last_used_at} /></> : "never used"}
                </span>
              </span>
              {t.revoked_at ? (
                <Badge>revoked</Badge>
              ) : (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:bg-danger-soft hover:text-danger"
                  onClick={() =>
                    start(async () => {
                      const r = await revokeApiToken(t.id);
                      if (!r.ok) setError(r.error);
                    })
                  }
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Alert error={error} />
    </div>
  );
}
