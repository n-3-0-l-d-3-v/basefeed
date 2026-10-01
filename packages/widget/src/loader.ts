// The only script a site embeds:
//   <script src="https://feedback.example.com/widget/loader.js" data-project="pk_..." defer></script>
// For ordinary visitors it reads two flags and exits. The widget itself loads only when feedback
// mode is switched on (dashboard frame, ?bn_feedback=1, a guest link, or earlier in this tab).

declare const __APP_FILE__: string;

export interface MountOptions {
  projectKey: string;
  appOrigin: string;
  embedded: boolean;
  hashToken: string | null;
}

(() => {
  const w = window as unknown as { __bnFeedback?: boolean };
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script || w.__bnFeedback) return;
  w.__bnFeedback = true;

  const projectKey = script.dataset.project;
  if (!projectKey || !/^pk_[a-f0-9]{24}$/.test(projectKey)) {
    console.warn("[basenine-feedback] missing or invalid data-project on the loader script");
    return;
  }

  const src = new URL(script.src);
  const params = new URLSearchParams(location.search);
  const embedded = window.parent !== window && params.get("bn_feedback") === "embed";
  const tokenMatch = /[#&]bn_token=([^&]+)/.exec(location.hash);
  const hashToken = tokenMatch ? decodeURIComponent(tokenMatch[1]!) : null;

  let active = embedded || params.get("bn_feedback") === "1" || hashToken !== null;
  if (!active) {
    try {
      active = sessionStorage.getItem(`bn_feedback:${projectKey}`) === "1";
    } catch {
      /* storage blocked: stay inactive */
    }
  }
  if (!active) return;

  const start = () => {
    const url = new URL(__APP_FILE__, src).href;
    import(/* @vite-ignore */ url)
      .then((m: { mount(o: MountOptions): void }) => m.mount({ projectKey, appOrigin: src.origin, embedded, hashToken }))
      .catch((e) => console.error("[basenine-feedback] failed to load", e));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
