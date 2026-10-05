import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { emailText, localEnv, login, siteFrame } from "../e2e/helpers";

// Every picture in the README comes from this script: the real app, the Acme demo data, the real AI
// provider. Nothing is mocked or edited afterwards. Run: pnpm --filter web screens
const OUT = join(__dirname, "../../../docs/images");
const shot = (name: string) => join(OUT, `${name}.png`);
const service = () => ({ apikey: localEnv("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${localEnv("SUPABASE_SERVICE_ROLE_KEY")}` });
const rest = (path: string) => `${localEnv("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/${path}`;
const CLIENT = "priya@acmelogistics.example";

test("README screenshots", async ({ page, request, browser }) => {
  const [{ id: project }] = (await (await request.get(rest("projects?public_key=eq.pk_ac3e0000000000000000b9d1&select=id"), { headers: service() })).json()) as { id: string }[];

  /** Run queued jobs until no comment is waiting for AI triage, so the pictures show what the AI really said. */
  const triageDone = () =>
    expect
      .poll(
        async () => {
          // One run handles several comments in turn and each AI call takes seconds: give it time to answer.
          await request.get("/api/jobs/run", { headers: { authorization: `Bearer ${localEnv("CRON_SECRET")}` }, timeout: 90_000 });
          const rows = (await (await request.get(rest(`comments?project_id=eq.${project}&select=triage_state`), { headers: service() })).json()) as { triage_state: string }[];
          return rows.filter((r) => r.triage_state === "pending").length;
        },
        { timeout: 600_000, intervals: [3_000] },
      )
      .toBe(0);
  await triageDone();

  // The Next.js development badge is not part of the product.
  const noDevBadge = () => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.addEventListener("DOMContentLoaded", () => document.head.append(style));
  };
  await page.addInitScript(noDevBadge);
  const settle = (ms = 1500) => page.waitForTimeout(ms);
  const snap = async (name: string) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(400);
    await page.screenshot({ path: shot(name) });
  };
  const detail = page.getByRole("article", { name: /Comment \d+/ });
  // Comments are opened by what the client wrote, not by the AI's title, which is worded differently on every run.
  const open = async (bodyContains: string) => {
    const [c] = (await (
      await request.get(rest(`comments?project_id=eq.${project}&body=ilike.*${encodeURIComponent(bodyContains)}*&select=id,page_id`), { headers: service() })
    ).json()) as { id: string; page_id: string }[];
    await page.goto(`/p/${project}?page=${c!.page_id}&c=${c!.id}`);
    await siteFrame(page);
    await expect(detail).toBeVisible();
    await settle(2500);
  };

  await login(page);

  // SCREENS_LATE=1 (with SCREENS_SKIP_RESET=1) retakes only the last pictures, on the data of a finished run.
  if (!process.env.SCREENS_LATE) {
  // Settings first: client access (needed for the sign-off emails below) and an assignment rule.
  await page.goto(`/p/${project}/settings`);
  await page.getByLabel("Label").fill("Acme review, round one");
  await page.getByRole("button", { name: "Create link" }).click();
  await expect(page.locator('input[readonly][value*="/s/"]').first()).toBeVisible();
  await page.getByLabel(/^Bug/).selectOption({ label: "Demo Designer" });
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // Canvas: the client's site, on its own origin, with every comment pinned to its element.
  await page.goto(`/p/${project}`);
  await siteFrame(page);
  await settle(2500);
  await snap("canvas");

  // A client's copy request: context captured, the exact replacement extracted, the change noticed.
  await open("Sales wants this to say");
  await snap("comment");

  // The site was edited after the comment: the tool says what changed and offers to verify.
  await open("headline wraps awkwardly");
  await snap("likely-fixed");

  // Resolving a client's comment asks the client to confirm. No message to write.
  await detail.getByRole("button", { name: /Resolve/ }).first().click();
  await expect(detail.getByText(/Waiting for Priya to confirm/)).toBeVisible();
  let mail: string | null = null;
  await expect.poll(async () => (mail = await emailText(CLIENT, "Does it look right?")), { timeout: 30_000 }).not.toBeNull();
  const clientUrl = /Check it on the page: (\S+)/.exec(mail!)![1]!;
  const statusUrl = /See where all your comments stand: (\S+)/.exec(mail!)![1]!;

  // The client's side: their own site, their comment, two buttons.
  const client = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
  await client.addInitScript(noDevBadge);
  const guest = await client.newPage();
  await guest.goto(clientUrl);
  await expect(guest.getByRole("dialog", { name: /Comment \d+/ }).getByText("Ready for you to check")).toBeVisible();
  await guest.waitForTimeout(1500);
  await guest.screenshot({ path: shot("client-signoff") });

  // The same client leaves a comment nobody could act on, to show what the AI does with it.
  await guest.keyboard.press("Escape");
  await guest.getByRole("button", { name: "Comment", exact: true }).click();
  await guest.locator(".section_cta h2").click();
  await guest.getByPlaceholder("What should change?").fill("This doesn't feel right. Can you fix it?");
  await guest.getByRole("button", { name: "Send" }).click();
  await expect(guest.getByRole("status")).toContainText(/Comment #\d+ added/);

  await guest.goto(statusUrl);
  await expect(guest.getByRole("heading", { name: /Your feedback/ })).toBeVisible();
  await guest.waitForTimeout(800);
  await guest.screenshot({ path: shot("client-status") });
  await client.close();

  await triageDone();
  await open("feel right");
  // If the AI did not flag it, stop here rather than publish a picture that shows nothing.
  await expect(detail.getByText("Too vague to act on")).toBeVisible();
  await snap("ai-flag");

  }

  // The page check panel. The canvas shows the site scaled down to fit, so this one picture is taken
  // at a higher pixel density to keep the findings readable.
  const sharp = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
  const closeUp = await sharp.newPage();
  await closeUp.addInitScript(noDevBadge);
  await login(closeUp);
  await closeUp.goto(`/p/${project}`);
  const site = await siteFrame(closeUp);
  await site.getByRole("button", { name: "Check page" }).click();
  const panel = site.getByRole("dialog", { name: "Page check" });
  await expect(panel).toBeVisible();
  await closeUp.waitForTimeout(1500);
  await panel.screenshot({ path: shot("page-check") });
  await sharp.close();

  await page.goto(`/p/${project}/board`);
  await settle();
  await snap("board");

  await page.goto(`/p/${project}/impact`);
  await settle();
  await page.screenshot({ path: shot("impact"), fullPage: true }); // the page is taller than the window
});
