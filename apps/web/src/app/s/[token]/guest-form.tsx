"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import type { JoinState } from "./page";

export function GuestForm({ projectName, site, action }: { projectName: string; site: string; action: (s: JoinState, f: FormData) => Promise<JoinState> }) {
  const [state, submit, pending] = useActionState(action, undefined);
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-baseline justify-center gap-2">
          <span className="text-[17px] font-bold tracking-[-0.01em]">BASENINE</span>
          <span className="font-pixel text-[14px] text-pink-deep">Feedback</span>
        </div>
        <form action={submit} className="flex flex-col gap-4 rounded-2xl bg-panel p-7 shadow-[var(--shadow-pop)]">
          <div>
            <p className="eyebrow text-pink-deep">You&apos;re invited to review</p>
            <h1 className="mt-2 text-[24px] font-normal leading-tight tracking-[-0.03em]">{projectName}</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              You&apos;ll go to <span className="font-mono text-[12px] text-ink-2">{site.replace(/^https?:\/\//, "")}</span>. Click anything on the page to leave a comment right where it
              belongs. No account needed.
            </p>
          </div>
          <Field label="Your name" htmlFor="g-name">
            <Input id="g-name" name="name" required maxLength={80} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="g-email" hint="So the team can reply to you.">
            <Input id="g-email" name="email" type="email" required autoComplete="email" />
          </Field>
          {state?.error && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {state.error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={pending} className="mt-1">
            {pending ? "Opening the site…" : "Start reviewing"}
          </Button>
        </form>
      </div>
    </main>
  );
}
