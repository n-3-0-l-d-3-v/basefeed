import { render } from "preact";
import type { MountOptions } from "../loader";
import { App } from "./App";
import { css } from "./styles";

/**
 * Fonts must be declared on the document for Shadow DOM text to use them. Only happens in feedback
 * mode, under unique names, so the site's own typography is untouched.
 */
function loadFonts(appOrigin: string) {
  if (document.querySelector("[data-bn-fonts]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap";
  link.setAttribute("data-bn-fonts", "");
  const face = document.createElement("style");
  face.setAttribute("data-bn-fonts", "");
  face.textContent = `@font-face{font-family:"BN Pixel";src:url("${appOrigin}/fonts/GeistPixel-Square.woff2") format("woff2");font-display:swap}`;
  document.head.append(link, face);
}

export function mount(opts: MountOptions) {
  if (document.querySelector("bn-feedback")) return;
  loadFonts(opts.appOrigin);
  // Attached to <html>, outside <body>: the site's own selectors, nth-of-type indexes and our anchoring
  // index never see it. Shadow DOM keeps the site's CSS and ours from leaking into each other.
  const host = document.createElement("bn-feedback");
  host.setAttribute("data-bn-root", "");
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const root = document.createElement("div");
  root.className = "root";
  shadow.append(style, root);

  const destroy = () => {
    render(null, root);
    host.remove();
    (window as unknown as { __bnFeedback?: boolean }).__bnFeedback = false;
  };
  render(<App opts={opts} host={host} destroy={destroy} />, root);
}
