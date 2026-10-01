"use client";

import { useEffect, useState } from "react";

export function HandBack({ token, pk, origin, projectName }: { token: string; pk: string; origin: string; projectName: string }) {
  const [sent, setSent] = useState<boolean | null>(null);
  useEffect(() => {
    if (!window.opener) return setSent(false);
    // targetOrigin pins delivery to the site that was verified server-side.
    window.opener.postMessage({ type: "bn:token", token, pk }, origin);
    setSent(true);
    const t = window.setTimeout(() => window.close(), 400);
    return () => window.clearTimeout(t);
  }, [token, pk, origin]);

  if (sent === false) return <p>Open this from the feedback button on the site you&apos;re reviewing.</p>;
  return (
    <p role="status">
      Signed in to <strong>{projectName}</strong>. You can close this window.
    </p>
  );
}
