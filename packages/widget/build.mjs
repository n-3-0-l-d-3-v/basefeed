// Builds the embed into apps/web/public/widget:
//   loader.js  – tiny, stable URL, short cache. This is what sites embed.
//   app-[hash].js (+ chunks) – the real widget, immutable cache, loaded only when feedback mode is on.
import { build, context } from "esbuild";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../apps/web/public/widget");
const watch = process.argv.includes("--watch");
const production = !watch;

const common = {
  bundle: true,
  minify: production,
  sourcemap: production ? false : "inline",
  target: ["es2020", "safari14"],
  legalComments: "none",
  logLevel: "info",
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
};

async function buildApp() {
  const result = await build({
    ...common,
    entryPoints: { app: path.join(here, "src/app/main.tsx") },
    outdir: out,
    format: "esm",
    splitting: true,
    entryNames: "[name]-[hash]",
    chunkNames: "chunk-[hash]",
    jsx: "automatic",
    jsxImportSource: "preact",
    metafile: true,
  });
  const entry = Object.entries(result.metafile.outputs).find(([, o]) => o.entryPoint?.endsWith("main.tsx"));
  return path.basename(entry[0]);
}

async function buildLoader(appFile) {
  await build({
    ...common,
    entryPoints: [path.join(here, "src/loader.ts")],
    outfile: path.join(out, "loader.js"),
    format: "iife",
    define: { ...common.define, __APP_FILE__: JSON.stringify(appFile) },
  });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

if (!watch) {
  const appFile = await buildApp();
  await buildLoader(appFile);
  const files = await readdir(out);
  await writeFile(path.join(out, "manifest.json"), JSON.stringify({ app: appFile, files }, null, 2));

  // Size budgets. The loader runs for every visitor of a client's site; the app only in feedback
  // mode. A dependency that slips into either (it has happened) fails the build instead of shipping.
  const BUDGET = { "loader.js": 1_500, [appFile]: 120_000 };
  for (const [file, max] of Object.entries(BUDGET)) {
    const { size } = await stat(path.join(out, file));
    if (size > max) throw new Error(`${file} is ${size} bytes; the budget is ${max}. Check what was imported into the widget.`);
  }
} else {
  // Dev: stable names so the loader never needs rebuilding.
  await buildLoader("app.js");
  const ctx = await context({
    ...common,
    entryPoints: { app: path.join(here, "src/app/main.tsx") },
    outdir: out,
    format: "esm",
    splitting: true,
    chunkNames: "chunk-[hash]",
    jsx: "automatic",
    jsxImportSource: "preact",
  });
  await ctx.watch();
}
