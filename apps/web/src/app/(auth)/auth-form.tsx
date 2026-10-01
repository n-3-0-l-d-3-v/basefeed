"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, null);
  const isLogin = mode === "login";

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-baseline justify-center gap-2">
          <span className="text-[17px] font-bold tracking-[-0.01em]">BASENINE</span>
          <span className="font-pixel text-[14px] text-pink-deep">Feedback</span>
        </div>
        <div className="rounded-2xl bg-panel p-7 shadow-[var(--shadow-pop)]">
          <h1 className="text-[24px] font-normal tracking-[-0.03em]">{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-[13px] text-muted">{isLogin ? "Sign in to review your client sites." : "Your workspace is set up automatically."}</p>
          <form action={action} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="next" value={next} />
            {!isLogin && (
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" autoComplete="name" required maxLength={80} />
              </Field>
            )}
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
            </Field>
            <Field label="Password" htmlFor="password" hint={isLogin ? undefined : "At least 8 characters."}>
              <Input id="password" name="password" type="password" autoComplete={isLogin ? "current-password" : "new-password"} required minLength={isLogin ? 1 : 8} />
            </Field>
            {state?.error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
                {state.error}
              </p>
            )}
            {state?.message && (
              <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-ink">
                {state.message}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
              {pending ? "One moment…" : isLogin ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
        <p className="mt-5 text-center text-[13px] text-muted">
          {isLogin ? "New here? " : "Already have an account? "}
          <Link href={`/${isLogin ? "signup" : "login"}${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-ink underline decoration-pink decoration-2 underline-offset-4">
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </p>
      </div>
    </main>
  );
}
