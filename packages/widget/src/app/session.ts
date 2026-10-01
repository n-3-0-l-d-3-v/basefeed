import type { HostToWidget, WidgetToHost } from "@bn/shared";
import type { MountOptions } from "../loader";

function storageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: the session just won't survive navigation */
  }
}

type HostListener = (msg: HostToWidget) => void;

/**
 * Where the widget's credentials come from:
 *  - embedded in the dashboard: the parent frame sends a token after a handshake (origin-checked both ways)
 *  - guest link: the app redirects here with #bn_token=… (fragments never reach servers or Referer headers)
 *  - team member on the live site: a popup to the app mints a token and posts it back to this exact origin
 */
export class Session {
  token: string | null = null;
  private readonly tokenKey: string;
  private readonly activeKey: string;
  private readonly hostListeners = new Set<HostListener>();

  constructor(readonly opts: MountOptions) {
    this.tokenKey = `bn_token:${opts.projectKey}`;
    this.activeKey = `bn_feedback:${opts.projectKey}`;
    if (opts.embedded) window.addEventListener("message", this.onHostMessage);
  }

  private onHostMessage = (e: MessageEvent) => {
    if (e.origin !== this.opts.appOrigin || e.source !== window.parent) return;
    const msg = e.data as HostToWidget;
    if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("bn:")) return;
    if (msg.type === "bn:init") this.token = msg.token;
    for (const l of this.hostListeners) l(msg);
  };

  onHost(l: HostListener): () => void {
    this.hostListeners.add(l);
    return () => this.hostListeners.delete(l);
  }

  toHost(msg: WidgetToHost) {
    if (this.opts.embedded) window.parent.postMessage(msg, this.opts.appOrigin);
  }

  async init(): Promise<string | null> {
    if (!this.opts.embedded) storageSet(this.activeKey, "1");
    if (this.opts.hashToken) {
      storageSet(this.tokenKey, this.opts.hashToken);
      const hash = location.hash.replace(/([#&])bn_token=[^&]*&?/, "$1").replace(/[#&]$/, "");
      history.replaceState(history.state, "", location.pathname + location.search + hash);
    }
    if (this.opts.embedded) return this.waitForHost();
    this.token = storageGet(this.tokenKey);
    return this.token;
  }

  /** Keep announcing until the dashboard answers: its listener or token may not be ready on the first try. */
  private waitForHost(): Promise<string | null> {
    return new Promise((resolve) => {
      const announce = () => this.toHost({ type: "bn:ready", version: "1" });
      const ping = window.setInterval(announce, 1000);
      const stop = () => {
        window.clearInterval(ping);
        window.clearTimeout(timer);
        off();
      };
      const timer = window.setTimeout(() => {
        stop();
        resolve(null);
      }, 30_000);
      const off = this.onHost((msg) => {
        if (msg.type !== "bn:init") return;
        stop();
        resolve(msg.token);
      });
      announce();
    });
  }

  connect(): Promise<string | null> {
    const url = new URL("/widget/connect", this.opts.appOrigin);
    url.searchParams.set("pk", this.opts.projectKey);
    url.searchParams.set("origin", location.origin);
    const popup = window.open(url.href, "bn-connect", "popup,width=460,height=620");
    if (!popup) return Promise.resolve(null);
    return new Promise((resolve) => {
      const onMessage = (e: MessageEvent) => {
        if (e.origin !== this.opts.appOrigin || e.source !== popup) return;
        const data = e.data as { type?: string; token?: string; pk?: string };
        if (data?.type !== "bn:token" || data.pk !== this.opts.projectKey || typeof data.token !== "string") return;
        cleanup();
        this.setToken(data.token);
        resolve(data.token);
      };
      const poll = window.setInterval(() => {
        if (popup.closed) {
          cleanup();
          resolve(this.token);
        }
      }, 500);
      const cleanup = () => {
        window.removeEventListener("message", onMessage);
        window.clearInterval(poll);
      };
      window.addEventListener("message", onMessage);
    });
  }

  setToken(token: string | null) {
    this.token = token;
    if (!this.opts.embedded) storageSet(this.tokenKey, token);
  }

  /** Leave feedback mode on this site for this tab. */
  deactivate() {
    this.setToken(null);
    storageSet(this.activeKey, null);
  }
}
