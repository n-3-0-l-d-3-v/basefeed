import { defineConfig, devices } from "@playwright/test";

// Takes the README screenshots from the real app: local Supabase with the Acme demo data, the
// Next.js app on :3000 (with the AI provider from .env.local, so the AI cards are real output) and
// the demo client site on :4000 with its "round one" edits applied. Run: pnpm --filter web screens
export default defineConfig({
  testDir: "./screens",
  globalSetup: "./screens/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 900_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 } }],
  webServer: [
    { command: "pnpm dev", url: "http://localhost:3000/login", reuseExistingServer: false, timeout: 120_000 },
    {
      command: "node ../../e2e/site/build.mjs && node ../../e2e/site/serve.mjs",
      url: "http://localhost:4000",
      reuseExistingServer: false,
      env: { SITE_DIR: "dist", APP_URL: "http://localhost:3000" },
    },
  ],
});
