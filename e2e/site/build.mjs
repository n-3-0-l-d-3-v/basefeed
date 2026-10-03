// Builds the demo client site for deployment: the same pages the end-to-end tests use, pointed at
// the deployed app (APP_URL) and the demo project's public key instead of localhost.
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const app = (process.env.APP_URL ?? "").replace(/\/$/, "");
if (!/^https:\/\//.test(app)) throw new Error("Set APP_URL to the deployed app, e.g. https://basefeed.vercel.app");
const key = process.env.DEMO_PROJECT_KEY ?? "pk_basenine_demo_acme";

const root = fileURLToPath(new URL(".", import.meta.url));
const out = new URL("dist/", import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const f of await readdir(root)) {
  if (f.endsWith(".css")) await cp(new URL(f, import.meta.url), new URL(f, out));
  if (f.endsWith(".html")) {
    const html = (await readFile(new URL(f, import.meta.url), "utf8"))
      .replaceAll("http://localhost:3000", app)
      .replaceAll("pk_000000000000000000000001", key);
    await writeFile(new URL(f, out), html);
  }
}
console.log(`demo site built for ${app} (${key})`);
