import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PROJECT = "a0000000-0000-4000-8000-000000000001";
export const SITE = "http://localhost:4000";

/** Demo credentials live only in the local seed file; read them from there rather than duplicating. */
function demoLogin() {
  const seed = readFileSync(join(__dirname, "../../../supabase/seed.sql"), "utf8");
  const m = /Demo login: (\S+) \/ (\S+)/.exec(seed);
  if (!m) throw new Error("demo login not found in supabase/seed.sql");
  return { email: m[1]!, password: m[2]! };
}

export async function login(page: Page) {
  const { email, password } = demoLogin();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL("http://localhost:3000/");
}

export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

/** The framed client site, once the widget inside it has connected to the dashboard. */
export async function siteFrame(page: Page) {
  const site = page.frameLocator('iframe[title^="Live preview"]');
  await expect(site.getByRole("toolbar", { name: "Feedback" })).toBeVisible({ timeout: 30_000 });
  return site;
}
