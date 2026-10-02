"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvite } from "@/app/(app)/account/actions";
import { Button } from "@/components/ui";

export function JoinButton({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        className="w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptInvite(token);
            if (!r.ok) return setError(r.error);
            router.push("/");
          })
        }
      >
        {pending ? "Joining…" : "Join workspace"}
      </Button>
      <p className="text-center text-[12px] text-muted">Signed in as {email}</p>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
