// Builds the demo client site for deployment: the same pages the end-to-end tests use, pointed at
// the deployed app (APP_URL) and the demo project's public key instead of localhost.
//
// By default it also applies ROUND_ONE: the edits a studio would publish after the first round of
// feedback in supabase/demo/acme-demo.sql. The demo comments were captured on the original pages,
// so on the deployed site the tool shows what it does when a site changes under its comments:
// "changed since this comment", "element changed" and "element removed". DEMO_EDITS=0 turns it off.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const app = (process.env.APP_URL ?? "").replace(/\/$/, "");
if (!/^https:\/\/|^http:\/\/localhost[:/]?/.test(app)) throw new Error("Set APP_URL to the deployed app, e.g. https://basefeed.vercel.app");
const key = process.env.DEMO_PROJECT_KEY ?? "pk_ac3e0000000000000000b9d1";
// Same rule the widget loader enforces; a key it rejects would leave the site without feedback mode.
if (!/^pk_[a-f0-9]{24}$/.test(key)) throw new Error(`Invalid project key: ${key}`);

const ROUND_ONE = {
  css: `
/* Round one of client feedback, published. */
.heading-style-h1 { font-size: 48px; max-width: 11em; }
.button.is-secondary { color: #1b2a6b; }
@media (max-width: 991px) { .heading-style-h1 { font-size: 40px; } }
@media (max-width: 767px) { .heading-style-h1 { font-size: 28px; overflow-wrap: anywhere; } }
`,
  html: [
    // "Sales wants this to say Book a demo."
    ['<a href="#" class="button" data-w-id="a1b2c3">Start free trial</a>', '<a href="#" class="button" data-w-id="a1b2c3">Book a demo</a>'],
    // "Can we hide Customers until the case studies are ready?"
    [/\s*<a href="#" class="navbar_link">Customers<\/a>/, ""],
  ],
};
const edits = process.env.DEMO_EDITS !== "0";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = new URL("dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of await readdir(root)) {
  if (f.endsWith(".css")) await writeFile(new URL(f, out), (await readFile(new URL(f, import.meta.url), "utf8")) + (edits ? ROUND_ONE.css : ""));
  if (f.endsWith(".html")) {
    let html = (await readFile(new URL(f, import.meta.url), "utf8")).replaceAll("http://localhost:3000", app).replaceAll("pk_000000000000000000000001", key);
    if (edits)
      for (const [from, to] of ROUND_ONE.html) {
        // Every edit must apply on the home page: a silent miss would leave the demo showing nothing.
        if (f === "index.html" && !(typeof from === "string" ? html.includes(from) : from.test(html))) throw new Error(`Edit no longer matches index.html: ${from}`);
        html = html.replace(from, to);
      }
    await writeFile(new URL(f, out), html);
  }
}
console.log(`demo site built for ${app} (${key})${edits ? " with round-one edits" : ""}`);
