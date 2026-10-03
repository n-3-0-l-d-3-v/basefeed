import { defineConfig, devices } from "@playwright/test";

// Runs against the real stack: local Supabase (`supabase start` + `supabase db reset` for the seed),
// the Next.js app on :3000 and the demo client site on :4000 (a different origin, like a real site).
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } }],
  webServer: [
    // CI tests the production build (and so also proves it builds); locally, reuse the dev server.
    process.env.CI
      ? { command: "pnpm build && pnpm start", url: "http://localhost:3000/login", timeout: 300_000 }
      : // AI off for test runs it starts itself: the free AI quota is small and tests don't assert on triage.
        { command: "pnpm dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000, env: { AI_PROVIDER: "none" } },
    { command: "node ../../e2e/site/serve.mjs", url: "http://localhost:4000", reuseExistingServer: true },
  ],
});
