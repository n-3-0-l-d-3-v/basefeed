"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui";

export function snippetFor(appUrl: string, publicKey: string) {
  return `<script src="${appUrl}/widget/loader.js" data-project="${publicKey}" defer></script>`;
}

export function InstallSnippet({ appUrl, publicKey }: { appUrl: string; publicKey: string }) {
  const [copied, setCopied] = useState(false);
  const code = snippetFor(appUrl, publicKey);
  return (
    <div className="flex flex-col gap-3">
      <pre className="overflow-x-auto rounded-lg bg-night px-4 py-3 font-mono text-[12px] leading-relaxed text-white/90">
        <code>
          <span className="text-pink">&lt;script</span> <span className="text-white/55">src=</span>
          <span className="text-accent">&quot;{appUrl}/widget/loader.js&quot;</span> <span className="text-white/55">data-project=</span>
          <span className="text-accent">&quot;{publicKey}&quot;</span> <span className="text-white/55">defer</span>
          <span className="text-pink">&gt;&lt;/script&gt;</span>
        </code>
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="primary"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy snippet"}
        </Button>
        <span className="text-[12px] text-muted">
          In Webflow: Site settings → Custom code → <span className="font-medium text-ink-2">Footer code</span>, then publish.
        </span>
      </div>
    </div>
  );
}
