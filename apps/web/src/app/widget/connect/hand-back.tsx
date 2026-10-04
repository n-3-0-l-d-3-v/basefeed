"use client";

import { useEffect, useSyncExternalStore } from "react";

const never = () => () => {};

export function HandBack({ token, pk, origin, projectName }: { token: string; pk: string; origin: string; projectName: string }) {
  // Whether this window was opened by the site being reviewed; unknown (null) until it runs in the browser.
  const opened = useSyncExternalStore<boolean | null>(
    never,
    () => window.opener !== null,
    () => null,
  );
  useEffect(() => {
    if (!window.opener) return;
    // targetOrigin pins delivery to the site that was verified server-side.
    window.opener.postMessage({ type: "bn:token", token, pk }, origin);
    const t = window.setTimeout(() => window.close(), 400);
    return () => window.clearTimeout(t);
  }, [token, pk, origin]);

  if (opened === false) return <p>Open this from the feedback button on the site you&apos;re reviewing.</p>;
  return (
    <p role="status">
      Signed in to <strong>{projectName}</strong>. You can close this window.
    </p>
  );
}
