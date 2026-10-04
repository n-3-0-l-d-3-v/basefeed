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

/** A value from the app's local environment file (the same one the dev server reads). */
export function localEnv(key: string): string {
  const file = readFileSync(join(__dirname, "../.env.local"), "utf8");
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(file);
  if (!m) throw new Error(`${key} not found in apps/web/.env.local`);
  return m[1]!.trim().replace(/^["']|["']$/g, "");
}

export const unique = (label: string) => `${label} ${Date.now().toString(36)}`;

/** Local Supabase's Mailpit inbox, where development email is delivered. */
export const MAILPIT = "http://127.0.0.1:56324";

export async function inbox(to: string): Promise<{ Subject: string; Snippet: string }[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!res.ok) return [];
  return ((await res.json()) as { messages: { Subject: string; Snippet: string }[] }).messages ?? [];
}

/** The framed client site, once the widget inside it has connected to the dashboard. */
export async function siteFrame(page: Page) {
  const site = page.frameLocator('iframe[title^="Live preview"]');
  await expect(site.getByRole("toolbar", { name: "Feedback" })).toBeVisible({ timeout: 30_000 });
  return site;
}

/** Plain-text body of the newest email to `to` that mentions `containing`. */
export async function emailText(to: string, containing: string): Promise<string | null> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  if (!res.ok) return null;
  const { messages } = (await res.json()) as { messages: { ID: string }[] };
  for (const m of messages ?? []) {
    const full = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as { Text: string };
    if (full.Text.includes(containing)) return full.Text;
  }
  return null;
}
