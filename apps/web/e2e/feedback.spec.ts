import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { emailText, inbox, localEnv, login, PROJECT, SITE, siteFrame, unique } from "./helpers";

test.describe("site visitors", () => {
  test("ordinary visitors get only the 1 KB loader and no widget", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto(SITE);
    await page.waitForLoadState("networkidle");
    expect(requests.filter((u) => u.includes("/widget/"))).toEqual(["http://localhost:3000/widget/loader.js"]);
    expect(requests.some((u) => u.includes("/api/widget"))).toBe(false);
    await expect(page.locator("bn-feedback")).toHaveCount(0);
  });
});

test.describe("team on the dashboard", () => {
  let errors: string[] = [];
  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`console: ${m.text()}`);
    });
    await login(page);
  });
  // Quality gate: the dashboard must not log errors during any of these flows.
  test.afterEach(() => expect(errors).toEqual([]));

  test("pins a comment to an element of the live site, with context captured automatically", async ({ page }) => {
    const text = unique("Headline is too long on mobile");
    await page.goto(`/p/${PROJECT}`);
    const site = await siteFrame(page);

    await site.locator("h1.heading-style-h1").click();
    const composer = site.getByRole("dialog", { name: "New comment" });
    await expect(composer.getByText("h1.heading-style-h1")).toBeVisible();
    await composer.getByPlaceholder("What should change?").fill(text);
    await composer.getByRole("button", { name: "Send" }).click();
    await expect(site.getByRole("status")).toContainText(/Comment #\d+ added/);

    // The dashboard opens the new comment (message from the widget) with the element and device it captured.
    const detail = page.getByRole("article", { name: /Comment \d+/ });
    await expect(detail.getByText(text).first()).toBeVisible();
    await expect(detail.getByText(".heading-style-h1", { exact: true })).toBeVisible();
    await expect(detail.getByText(/desktop · 1440×/)).toBeVisible(); // the frame renders at the real device width
  });

  test("device previews render the site at the real width, so comments carry the right breakpoint", async ({ page }) => {
    await page.goto(`/p/${PROJECT}`);
    await page.getByRole("group", { name: "Device width" }).getByRole("button", { name: "Mobile" }).click();
    const site = await siteFrame(page);
    await site.locator("h1.heading-style-h1").click({ position: { x: 12, y: 12 } });
    await site.getByPlaceholder("What should change?").fill(unique("Too big on phones"));
    await site.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("article", { name: /Comment \d+/ }).getByText(/mobile-portrait · 390×/)).toBeVisible();
  });

  test("a comment stays on its element when the page changes above it", async ({ page }) => {
    const text = unique("Make this card's link bolder");
    await page.goto(`/p/${PROJECT}`);
    const site = await siteFrame(page);

    await site.locator(".feature_card").nth(1).getByText("Learn more").click();
    await site.getByPlaceholder("What should change?").fill(text);
    await site.getByRole("button", { name: "Send" }).click();
    const added = await site.getByRole("status").textContent();
    const number = /#(\d+)/.exec(added ?? "")![1]!;

    // Simulate the site being edited: a banner pushes everything down, another card is added before it.
    const frame = page.frames().find((f) => f.url().startsWith(SITE))!;
    await frame.evaluate(() => {
      document.body.insertAdjacentHTML("afterbegin", '<div class="cookie_banner"><p>We use cookies to improve your experience.</p></div>');
      const list = document.querySelector(".features_list")!;
      list.insertAdjacentHTML("afterbegin", '<div class="feature_card"><h3>Route optimisation</h3><p>New.</p><a href="#" class="button is-secondary">Learn more</a></div>');
    });

    // Still pinned (not "element changed"), and sitting on the same "Learn more" (the Smart dispatch card).
    const pin = site.getByRole("button", { name: `Comment ${number}`, exact: true });
    await expect(pin).toBeVisible();
    const target = site.locator(".feature_card", { hasText: "Smart dispatch" }).getByText("Learn more");
    // The pin re-resolves after the edit; wait for it to settle on the Smart dispatch link.
    await expect
      .poll(async () => {
        const [p, t] = await Promise.all([pin.boundingBox(), target.boundingBox()]);
        return p && t ? Math.abs(p.y + p.height / 2 - (t.y + t.height / 2)) : Infinity;
      })
      .toBeLessThan(20);
  });

  test("a member re-pins a comment whose element was removed, and it stays there", async ({ page }) => {
    const text = unique("Tighten this heading");
    await page.setViewportSize({ width: 1600, height: 1400 }); // the whole scaled site fits, widget toolbar included
    await page.goto(`/p/${PROJECT}`);
    let site = await siteFrame(page);

    await site.locator(".feature_card").nth(2).locator("h3").click();
    await site.getByPlaceholder("What should change?").fill(text);
    await site.getByRole("button", { name: "Send" }).click();
    const number = /#(\d+)/.exec((await site.getByRole("status").textContent()) ?? "")![1]!;

    // The site is rebuilt: the heading is gone, so the comment is shown as removed rather than guessed.
    // Hold the widget's "removed" health report until after the re-pin, the order a slow network can produce.
    let reportSent!: () => void;
    let release!: () => void;
    const sent = new Promise<void>((r) => (reportSent = r));
    const held = new Promise<void>((r) => (release = r));
    await page.route("**/api/widget/anchor-report", async (route) => {
      const body = route.request().method() === "POST" ? (route.request().postData() ?? "") : "";
      if (body.includes('"detached"')) {
        reportSent();
        await held;
      }
      await route.continue();
    });
    const frame = page.frames().find((f) => f.url().startsWith(SITE))!;
    await frame.evaluate(() => document.querySelectorAll(".feature_card")[2]!.querySelector("h3")!.remove());
    await sent;
    await site.getByRole("button", { name: /open$/ }).click();
    await site.getByRole("dialog", { name: "Comments on this page" }).getByRole("button", { name: new RegExp(text) }).click();
    const thread = site.getByRole("dialog", { name: `Comment ${number}` });
    await expect(thread.getByText("Element removed")).toBeVisible();

    await thread.getByRole("button", { name: "Pick the new element" }).click();
    await expect(site.getByRole("status")).toContainText(`Click the element comment #${number} is about`);
    await site.locator(".feature_card").nth(2).locator("p").first().click();
    await expect(site.getByRole("status")).toContainText(`Comment #${number} moved`);

    // The stale report arrives after the move and must not undo it.
    const stale = page.waitForResponse((r) => r.url().endsWith("/api/widget/anchor-report") && r.request().method() === "POST");
    release();
    expect((await stale).status()).toBe(204);
    await page.unroute("**/api/widget/anchor-report");
    // The board has no live site to re-check the pin, so it shows exactly what the server stored.
    await page.goto(`/p/${PROJECT}/board`);
    await page.locator("article", { hasText: text }).locator("button.text-left").click();
    const detail = page.getByRole("dialog").getByRole("article", { name: `Comment ${number}` });
    await expect(detail.getByText(text).first()).toBeVisible();
    await expect(detail.getByText("Element removed")).toHaveCount(0);

    // And on the site the pin sits on the new element.
    await page.goto(`/p/${PROJECT}`);
    site = await siteFrame(page);
    const target = site.locator(".feature_card").nth(2).locator("p").first();
    await target.scrollIntoViewIfNeeded();
    const pin = site.getByRole("button", { name: `Comment ${number}`, exact: true });
    await expect
      .poll(async () => {
        const [p, t] = await Promise.all([pin.boundingBox(), target.boundingBox()]);
        return p && t ? Math.abs(p.y + p.height / 2 - (t.y + t.height / 2)) : Infinity;
      })
      .toBeLessThan(30);
  });

  test("the page check finds real problems and files them as pinned comments", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1400 });
    await page.goto(`/p/${PROJECT}`);
    const site = await siteFrame(page);
    await site.getByRole("button", { name: "Check page" }).click();
    const panel = site.getByRole("dialog", { name: "Page check" });
    await expect(panel.getByText('The link "Learn more" goes nowhere (href="#").').first()).toBeVisible();

    const row = panel.getByRole("listitem").filter({ hasText: 'The link "Customers" goes nowhere' });
    await row.getByRole("button", { name: /^Add as a comment/ }).click();
    // The dashboard opens it, labelled by the rule (no AI involved) and pinned to that link.
    const detail = page.getByRole("article", { name: /Comment \d+/ });
    await expect(detail.getByRole("heading", { name: "Link goes nowhere" })).toBeVisible();
    await expect(detail.getByText("Page check")).toBeVisible();
    await expect(detail.getByText(".navbar_link", { exact: true })).toBeVisible();
    // A filed finding shows its number instead of Add, so checking again never files it twice.
    await expect(row.getByText(/^#\d+$/)).toBeVisible();
    await expect(row.getByRole("button", { name: /^Add as a comment/ })).toHaveCount(0);
  });

  test("an assignment rule sends each kind of comment to the right person, and says so in the history", async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1400 });
    await page.goto(`/p/${PROJECT}/settings`);
    const rule = page.getByLabel(/^Bug/);
    await rule.selectOption({ label: "Demo Designer" });
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await page.reload();
    await expect(rule).toHaveValue(/.+/); // stored, not just chosen on screen

    // The same page sets how long a silent client is left alone before one reminder.
    const reminder = page.getByLabel(/Remind a client/);
    await expect(reminder).toHaveValue("3");
    await reminder.selectOption({ label: "After 7 days" });
    await expect(page.getByRole("status").filter({ hasText: "Saved." }).first()).toBeVisible();
    await page.reload();
    await expect(reminder).toHaveValue("7");
    await reminder.selectOption({ label: "After 3 days" });
    await expect(page.getByRole("status").filter({ hasText: "Saved." }).first()).toBeVisible();

    try {
      // The page check files a dead link as a bug: nobody assigns it, the rule does.
      await page.goto(`/p/${PROJECT}`);
      const site = await siteFrame(page);
      await site.getByRole("button", { name: "Check page" }).click();
      const panel = site.getByRole("dialog", { name: "Page check" });
      const row = panel.getByRole("listitem").filter({ hasText: 'The link "Learn more" goes nowhere' }).first();
      await row.getByRole("button", { name: /^Add as a comment/ }).click();
      const detail = page.getByRole("article", { name: /Comment \d+/ });
      await expect(detail.getByRole("heading", { name: "Link goes nowhere" })).toBeVisible();
      await expect(detail.getByLabel("Assignee").locator("option:checked")).toHaveText("Demo Designer");
      await detail.getByText(/^History/).click();
      await expect(detail.getByText("Assignment rule assigned it, because it is labelled bug")).toBeVisible();
    } finally {
      await page.goto(`/p/${PROJECT}/settings`);
      await rule.selectOption({ label: "Nobody" });
      await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    }
  });

  test("uploads a design image and pins a comment on it", async ({ page }, testInfo) => {
    const design = testInfo.outputPath("design.png");
    const shooter = await page.context().newPage();
    await shooter.goto(SITE);
    await shooter.screenshot({ path: design });
    await shooter.close();

    await page.goto(`/p/${PROJECT}`);
    await page.getByRole("button", { name: "Add page" }).first().click();
    await page.getByRole("dialog", { name: "Add a page" }).getByRole("button", { name: "Design image" }).click();
    await page.locator("#ap-file").setInputFiles(design);
    await page.getByLabel("Name (optional)").fill("Homepage mockup");
    await page.getByRole("button", { name: "Upload design" }).click();

    const image = page.getByRole("img", { name: "Homepage mockup" });
    await expect(image).toBeVisible();
    await image.click({ position: { x: 160, y: 90 } });
    const text = unique("Logo should be bigger");
    await page.getByPlaceholder("What should change?").fill(text);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("article", { name: /Comment \d+/ }).getByText(text).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Comment \d+$/ })).toHaveCount(1);
  });

  test("Ctrl+K finds a comment by its text and opens it", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: "Search" });
    await box.fill("Logo should be bigger");
    await expect(page.getByRole("option").first()).toContainText("Logo should be bigger");
    await box.press("Enter");
    await expect(page.getByRole("article", { name: /Comment \d+/ })).toContainText("Logo should be bigger");
  });

  test("attaches files, inserts emoji and plays Loom links inline in a thread", async ({ page }) => {
    // Stand-in for Loom's player so the test stays offline and deterministic.
    await page.route("https://www.loom.com/embed/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>Loom</title>" }));
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const search = page.getByRole("combobox", { name: "Search" });
    await search.fill("Logo should be bigger");
    await expect(page.getByRole("option").first()).toContainText("Logo should be bigger");
    await search.press("Enter");
    const detail = page.getByRole("article", { name: /Comment \d+/ });

    await expect(detail.getByRole("button", { name: "Attach files" })).toBeEnabled(); // thread loaded
    const png = { name: `${unique("logo reference")}.png`, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
    await detail.getByLabel("Files to attach").setInputFiles(png);
    const image = detail.getByRole("img", { name: png.name });
    await expect(image).toHaveJSProperty("naturalWidth", 1); // served back from private storage via a signed URL

    await detail.getByLabel("Files to attach").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
    await expect(detail.getByRole("alert")).toHaveText("Attach images (PNG, JPG, WebP, GIF) or PDFs.");

    const loom = "https://www.loom.com/share/0123456789abcdef0123456789abcdef";
    const reply = detail.getByLabel("Reply");
    await reply.fill(`Recorded a walkthrough: ${loom}.`);
    await reply.press("Control+Home");
    await detail.getByRole("button", { name: "Insert emoji" }).click();
    await page.getByRole("menuitem", { name: "👍" }).click();
    await expect(reply).toHaveValue(`👍Recorded a walkthrough: ${loom}.`);
    await detail.getByRole("button", { name: "Reply", exact: true }).click();
    const sent = detail.getByRole("region", { name: "Replies" });
    await expect(sent.getByRole("link", { name: loom })).toHaveAttribute("href", loom); // trailing "." is not part of the link
    await expect(sent.locator('iframe[title="Loom video"]')).toHaveAttribute("src", "https://www.loom.com/embed/0123456789abcdef0123456789abcdef");

    await image.hover();
    await detail.getByRole("button", { name: `Remove ${png.name}` }).click();
    await expect(image).toHaveCount(0);
  });

  test("an AI flag is a draft: the team edits the clarifying question before it is sent", async ({ page, request }) => {
    // AI is off in tests, so store the kind of result it produces for a vague comment.
    const service = { apikey: localEnv("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${localEnv("SUPABASE_SERVICE_ROLE_KEY")}` };
    const triage = {
      title: "Clarify how the headline should change",
      category: "question",
      priority: "medium",
      task: "Ask the author what should change.",
      needsClarification: true,
      clarificationQuestion: "Could you say how the headline should change?",
      duplicateOf: null,
      confidence: 0.3,
      change: null,
      scope: "tweak",
      reason: null,
    };
    const stored = await request.patch(`${localEnv("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/comments?project_id=eq.${PROJECT}&body=ilike.*Headline is too long on mobile*`, {
      headers: { ...service, prefer: "return=representation" },
      data: { triage, triage_state: "ready", title: triage.title },
    });
    const rows = (await stored.json()) as { id: string; page_id: string }[];
    expect(rows).toHaveLength(1);

    await page.goto(`/p/${PROJECT}?page=${rows[0]!.page_id}&c=${rows[0]!.id}`);
    const detail = page.getByRole("article", { name: /Comment \d+/ });
    const flag = detail.getByRole("region", { name: "AI triage" });
    await expect(flag.getByText("Too vague to act on")).toBeVisible();
    const question = flag.getByRole("textbox", { name: /Question to send/ });
    await expect(question).toHaveValue("Could you say how the headline should change?");
    const edited = unique("Shorter wording, or a smaller size?");
    await question.fill(edited);
    await flag.getByRole("button", { name: /^Ask / }).click();
    // The edited wording is what goes into the thread, and the flag is done.
    await expect(detail.getByText(edited)).toBeVisible();
    await expect(flag).toHaveCount(0);
  });

  test("moves a card on the board and records who did it", async ({ page }) => {
    await page.goto(`/p/${PROJECT}/board`);
    const card = page.getByRole("region", { name: "Open column" }).locator("article").first();
    await expect(card).toBeVisible();
    const label = await card.locator("span.font-mono").first().textContent();
    await card.locator("button.text-left").click();
    const drawer = page.getByRole("dialog");
    await drawer.getByLabel("Status").selectOption("in_progress");
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("region", { name: "In progress column" }).getByText(label!)).toBeVisible();
  });
});

test.describe("board, several at once", () => {
  test("selected cards are moved and assigned together, each change recorded per comment", async ({ page }) => {
    await login(page);
    await page.goto(`/p/${PROJECT}/board`);
    const open = page.getByRole("region", { name: "Open column" });
    const cards = open.getByRole("article");
    await expect(cards.nth(1)).toBeVisible();
    const before = await cards.count();
    const titles = [await cards.nth(0).getByRole("button").first().innerText(), await cards.nth(1).getByRole("button").first().innerText()];
    await cards.nth(0).getByRole("checkbox").check({ force: true });
    await cards.nth(1).getByRole("checkbox").check({ force: true });

    const bar = page.getByRole("toolbar", { name: "Selected comments" });
    await expect(bar).toContainText("2 selected");
    await bar.getByLabel("Assign selected to").selectOption({ label: "Demo Designer" });
    await expect(bar).toHaveCount(0); // applied, selection cleared

    for (const card of [cards.nth(0), cards.nth(1)]) await card.getByRole("checkbox").check({ force: true });
    await page.getByRole("toolbar", { name: "Selected comments" }).getByLabel("Move selected to").selectOption({ label: "In progress" });
    await expect(open.getByRole("article")).toHaveCount(before - 2);

    // Saved, not just moved on screen; and each comment's own history has the change.
    await page.reload();
    const progress = page.getByRole("region", { name: "In progress column" });
    for (const t of titles) await expect(progress.getByText(t.split("\n").pop()!.trim()).first()).toBeVisible();
    await progress.getByText(titles[0]!.split("\n").pop()!.trim()).first().click();
    const detail = page.getByRole("article", { name: /Comment \d+/ }).last();
    await expect(detail.getByLabel("Assignee").locator("option:checked")).toHaveText("Demo Designer");
    await detail.getByText(/^History/).click();
    await expect(detail.getByText("Demo Designer moved it from open to in progress")).toBeVisible();
  });
});

test.describe("clients via share link", () => {
  test("comment with just a name and email, and the team sees it", async ({ page, browser }) => {
    await login(page);
    await page.goto(`/p/${PROJECT}/settings`);
    await page.getByLabel("Label").fill("E2E client");
    await page.getByRole("button", { name: "Create link" }).click();
    const link = await page.locator('input[readonly][value*="/s/"]').inputValue();
    // The team keeps the dashboard open; the client's comment must arrive live, without a reload.
    await page.goto(`/p/${PROJECT}`);
    await page.getByRole("tab", { name: /^All/ }).click();

    const client = await browser.newContext();
    const guest = await client.newPage();
    await guest.goto(link);
    await guest.getByLabel("Your name").fill("Casey Client");
    await guest.getByLabel("Email").fill("casey@client.test");
    await guest.getByRole("button", { name: /start reviewing/i }).click();

    await guest.waitForURL(`${SITE}/**`);
    await expect(guest.getByRole("toolbar", { name: "Feedback" })).toBeVisible();
    expect(guest.url()).not.toContain("bn_token"); // credential removed from the address bar

    const text = unique("Can the CTA say Book a call");
    await guest.getByRole("button", { name: "Comment", exact: true }).click();
    await guest.locator(".section_cta h2").click();
    await guest.getByPlaceholder("What should change?").fill(text);
    // A client can show what they mean: a file attached from the site itself, no account needed.
    const shot = { name: `${unique("what-i-mean")}.png`, mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") };
    await guest.getByLabel("Files to attach").setInputFiles(shot);
    await guest.getByRole("button", { name: "Send" }).click();
    await expect(guest.getByRole("status")).toHaveText(/Comment #\d+ added$/);
    await client.close();

    await expect(page.getByText(text)).toBeVisible();

    // The team is emailed about the client's comment...
    await expect.poll(async () => (await inbox("demo@basenine.test")).some((m) => m.Snippet.includes(text)), { timeout: 20_000 }).toBe(true);

    // ...and when the team replies from the dashboard, the client is emailed the answer.
    const answer = unique("Yes, changing it to Book a call");
    await page.getByText(text).click();
    await expect(page.getByRole("article", { name: /Comment \d+/ }).getByRole("img", { name: shot.name })).toHaveJSProperty("naturalWidth", 1);
    await page.getByLabel("Reply").fill(answer);
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect.poll(async () => (await inbox("casey@client.test")).some((m) => m.Snippet.includes(answer)), { timeout: 20_000 }).toBe(true);
  });

  test("a member who chose the daily digest gets one email for the day instead of one per comment", async ({ page, browser, request }) => {
    await login(page);
    await page.goto("/account");
    const digest = page.getByRole("switch", { name: /Once a day instead/ });
    // The switch saves in the background; wait for that request before reloading.
    const toggle = async () => {
      const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/account"));
      await page.getByText("Once a day instead").click();
      await saved;
    };
    await toggle();
    await expect(digest).toBeChecked();
    await page.reload(); // saved, not just toggled on screen
    await expect(digest).toBeChecked();

    try {
      await page.goto(`/p/${PROJECT}/settings`);
      await page.getByLabel("Label").fill("E2E digest");
      await page.getByRole("button", { name: "Create link" }).click();
      const link = await page.locator('input[readonly][value*="/s/"]').first().inputValue();

      const client = await browser.newContext();
      const guest = await client.newPage();
      await guest.goto(link);
      await guest.getByLabel("Your name").fill("Dana Client");
      await guest.getByLabel("Email").fill("dana@client.test");
      await guest.getByRole("button", { name: /start reviewing/i }).click();
      await expect(guest.getByRole("toolbar", { name: "Feedback" })).toBeVisible();
      const first = unique("Footer links are hard to read");
      const second = unique("Swap the hero image");
      await guest.getByRole("button", { name: "Comment", exact: true }).click();
      for (const [target, text] of [[".section_cta h2", first], [".section_features h2", second]] as const) {
        await guest.locator(target).click();
        await guest.getByPlaceholder("What should change?").fill(text);
        await guest.getByRole("button", { name: "Send" }).click();
        await expect(guest.getByRole("status")).toContainText(/Comment #\d+ added/);
      }
      await client.close();

      // What the database does every morning (pg_cron), then what its ticker does: call the job runner.
      // The digest goes out at 09:00 in the member's own time zone (stored from this browser when the
      // switch was turned on), so step through tomorrow's half hours until it is that member's morning.
      const queue = async (at: Date) =>
        (await (
          await request.post(`${localEnv("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/rpc/queue_daily_digests`, {
            headers: { apikey: localEnv("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${localEnv("SUPABASE_SERVICE_ROLE_KEY")}` },
            data: { p_now: at.toISOString() },
          })
        ).json()) as number;
      const firstSlot = Math.ceil(Date.now() / 900_000) * 900_000; // quarter hours cover zones on :00, :30 and :45
      const queuedAt: number[] = [];
      for (let i = 0; i < 96; i++) if ((await queue(new Date(firstSlot + i * 900_000))) === 1) queuedAt.push(i);
      expect(queuedAt).toHaveLength(1); // one digest for the day, and only in the morning half hour
      const ran = await request.get("/api/jobs/run", { headers: { authorization: `Bearer ${localEnv("CRON_SECRET")}` } });
      expect(ran.ok()).toBe(true);

      let body: string | null = null;
      await expect.poll(async () => (body = await emailText("demo@basenine.test", "Daily digest")), { timeout: 20_000 }).toContain(first);
      expect(body).toContain(second); // both comments, one email
      expect(body).toContain("Dana Client (client)");
      // ...and neither comment was also sent on its own.
      const subjects = (await inbox("demo@basenine.test")).filter((m) => m.Snippet.includes(first) || m.Snippet.includes(second)).map((m) => m.Subject);
      expect(subjects.filter((s) => s.startsWith("New comment"))).toEqual([]);
    } finally {
      await page.goto("/account");
      if (await digest.isChecked()) await toggle();
      await expect(digest).not.toBeChecked();
      await page.reload();
      await expect(digest).not.toBeChecked();
    }
  });

  test("a resolved comment goes back to the client, who confirms it or sends it back from the emailed link", async ({ page, browser }) => {
    await login(page);
    await page.goto(`/p/${PROJECT}/settings`);
    await page.getByLabel("Label").fill("E2E sign-off");
    await page.getByRole("button", { name: "Create link" }).click();
    const link = await page.locator('input[readonly][value*="/s/"]').first().inputValue();

    const email = `robin.${Date.now().toString(36)}@client.test`;
    const fixed = unique("Make the pricing link bolder");
    const notFixed = unique("This heading is too small");
    let client = await browser.newContext();
    let guest = await client.newPage();
    await guest.goto(link);
    await guest.getByLabel("Your name").fill("Robin Client");
    await guest.getByLabel("Email").fill(email);
    await guest.getByRole("button", { name: /start reviewing/i }).click();
    await expect(guest.getByRole("toolbar", { name: "Feedback" })).toBeVisible();
    await guest.getByRole("button", { name: "Comment", exact: true }).click();
    for (const [target, text] of [[".navbar_link >> text=Pricing", fixed], [".section_features h2", notFixed]] as const) {
      await guest.locator(target).click();
      await guest.getByPlaceholder("What should change?").fill(text);
      await guest.getByRole("button", { name: "Send" }).click();
      await expect(guest.getByRole("status")).toContainText(/Comment #\d+ added/);
    }
    await client.close();

    // The team resolves both; nobody has to write to the client: each resolve asks them to confirm.
    await page.goto(`/p/${PROJECT}`);
    for (const text of [fixed, notFixed]) {
      await page.getByRole("tab", { name: /^All/ }).click();
      await page.getByText(text).first().click();
      const detail = page.getByRole("article", { name: /Comment \d+/ }).filter({ hasText: text });
      await detail.getByRole("button", { name: "Resolve" }).click();
      await expect(detail.getByText("Waiting for Robin to confirm")).toBeVisible();
      await detail.getByRole("button", { name: "Close" }).click();
    }
    const linkFor = async (text: string) => {
      let body: string | null = null;
      await expect.poll(async () => (body = await emailText(email, text, "Does it look right?")), { timeout: 20_000 }).not.toBeNull();
      return /Check it on the page: (\S+)/.exec(body!)![1]!;
    };

    // If the client says nothing, nobody chases: after three days the database queues one reminder
    // covering everything of theirs that is waiting. (Here with no waiting time, then the job runner.)
    const service = { apikey: localEnv("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${localEnv("SUPABASE_SERVICE_ROLE_KEY")}` };
    const remind = () => page.request.post(`${localEnv("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/rpc/queue_review_reminders`, { headers: service, data: { p_after: "0 seconds" } });
    await linkFor(fixed); // both resolves have reached the database once their emails exist
    await linkFor(notFixed);
    expect(await (await remind()).json()).toBe(1);
    expect((await page.request.get("/api/jobs/run", { headers: { authorization: `Bearer ${localEnv("CRON_SECRET")}` } })).ok()).toBe(true);
    let reminder: string | null = null;
    await expect.poll(async () => (reminder = await emailText(email, "2 changes are waiting for you to check")), { timeout: 20_000 }).toContain(fixed);
    expect(reminder).toContain(notFixed);
    expect(reminder).toContain("See where all your comments stand");
    expect(await (await remind()).json()).toBe(0); // once only

    // The same email carries one link to everything this client has asked for and where it stands.
    client = await browser.newContext();
    guest = await client.newPage();
    await linkFor(fixed);
    const statusUrl = /See where all your comments stand: (\S+)/.exec((await emailText(email, fixed, "Does it look right?"))!)![1]!;
    await guest.goto(statusUrl);
    await expect(guest.getByRole("heading", { name: "Your feedback, Robin Client" })).toBeVisible();
    const waiting = guest.getByRole("region", { name: /Waiting for you \(2\)/ });
    await expect(waiting.getByText(fixed)).toBeVisible();
    await expect(waiting.getByText(notFixed)).toBeVisible();
    await expect(guest.getByText("Internal")).toHaveCount(0); // only this client's own comments
    // The status link is read-only: its token is not accepted where comments are written.
    const asWidget = await page.request.get("/api/widget/me", { headers: { origin: SITE, authorization: `Bearer ${statusUrl.split("/").pop()}` } });
    expect(asWidget.status()).toBe(401);
    // A link that has been altered shows nothing.
    await guest.goto(`${statusUrl.slice(0, -3)}abc`);
    await expect(guest.getByText("Link not active")).toBeVisible();

    // The emailed link opens the page on that comment, already signed in as the client.
    await guest.goto(await linkFor(fixed));
    await expect(guest.getByRole("dialog", { name: /Comment \d+/ }).getByText("Ready for you to check")).toBeVisible();
    await guest.getByRole("button", { name: "Looks good" }).click();
    await expect(guest.getByRole("status")).toContainText("Thanks, confirmed");

    guest = await client.newPage(); // a second email, opened in a new tab
    await guest.goto(await linkFor(notFixed));
    const thread = guest.getByRole("dialog", { name: /Comment \d+/ });
    await thread.getByRole("textbox").fill("Still small on my laptop");
    await thread.getByRole("button", { name: "Not yet" }).click();
    await expect(guest.getByRole("status")).toContainText("Sent back to the team");

    // The status page follows: one confirmed, one reopened with their note.
    await guest.goto(statusUrl);
    await expect(guest.getByRole("region", { name: /Done \(1\)/ }).getByRole("listitem")).toContainText([fixed]);
    await expect(guest.getByRole("region", { name: /Done \(1\)/ })).toContainText("You confirmed this");
    const reopened = guest.getByRole("region", { name: /Not started yet \(1\)/ });
    await expect(reopened).toContainText(notFixed);
    await expect(reopened).toContainText("Reopened after your note");
    await expect(guest.getByRole("region", { name: /Waiting for you/ })).toHaveCount(0);
    await client.close();

    // The team sees both answers; the one sent back is open again with the client's note.
    await page.reload();
    await page.getByRole("tab", { name: /^All/ }).click();
    await expect(page.getByRole("button").filter({ hasText: fixed })).toContainText("Client confirmed");
    await page.getByRole("button").filter({ hasText: notFixed }).click();
    const detail = page.getByRole("article", { name: /Comment \d+/ }).filter({ hasText: notFixed });
    await expect(detail.getByText("Sent back by Robin")).toBeVisible();
    await expect(detail.getByLabel("Status")).toHaveValue("open");
    await expect(detail.getByText("Still small on my laptop")).toBeVisible();
    await detail.getByText(/^History/).click();
    await expect(detail.getByText("Reminder emailed the client, who had not answered for 3 days")).toBeVisible();

    // The team can also hand the client that status page themselves: one click copies the link.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await detail.getByRole("button", { name: "Copy client status link" }).click();
    await expect(detail.getByRole("button", { name: "Link copied" })).toBeVisible();
    const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
    const outsider = await browser.newContext(); // not signed in to anything
    const view = await outsider.newPage();
    await view.goto(copiedUrl);
    await expect(view.getByRole("heading", { name: "Your feedback, Robin Client" })).toBeVisible();
    await outsider.close();
    await expect.poll(async () => (await inbox("demo@basenine.test")).some((m) => m.Subject.startsWith("Not fixed yet")), { timeout: 20_000 }).toBe(true);

    // Impact reads the same history: both of this client's answers are counted as time spent waiting for them.
    await page.goto(`/p/${PROJECT}/impact`);
    const stages = page.getByRole("region", { name: "Where the time goes" });
    await expect(stages).toContainText(/waiting for the client's answer\s*median of 2 times/);
  });
});

test.describe("team", () => {
  test("an invited teammate signs up through the link and sees the workspace's projects", async ({ page, browser }) => {
    await login(page);
    await page.goto("/account");
    await page.getByRole("button", { name: "Create invite link" }).first().click();
    const link = await page.getByLabel("Invite link").inputValue();

    const mateContext = await browser.newContext();
    const mate = await mateContext.newPage();
    await mate.goto(link);
    await expect(mate.getByRole("heading", { name: /Join Demo Designer's workspace/ })).toBeVisible();
    await mate.getByRole("link", { name: "Create an account to join" }).click();
    await mate.getByLabel("Name").fill("Tara Teammate");
    await mate.getByLabel("Email").fill(`tara+${Date.now()}@studio.test`);
    await mate.getByLabel("Password").fill("correct-horse-42");
    await mate.getByRole("button", { name: "Create account" }).click();
    await mate.waitForURL(/\/invite\//);
    await mate.getByRole("button", { name: "Join workspace" }).click();
    await mate.waitForURL("http://localhost:3000/");
    await expect(mate.getByText("Acme (demo site)")).toBeVisible();
    await mateContext.close();
  });
});

test.describe("weekly summary", () => {
  test("a member who asked gets one email on Monday morning with each project's numbers", async ({ page, request }) => {
    await login(page);
    await page.goto("/account");
    const weekly = page.getByRole("switch", { name: /Weekly summary/ });
    const toggle = async () => {
      const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/account"));
      await page.getByText("Weekly summary", { exact: true }).click();
      await saved;
    };
    await toggle();
    await page.reload();
    await expect(weekly).toBeChecked();

    try {
      // The next Monday between 09:00 and 09:30 in this browser's time zone, which is what was stored with the switch.
      const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
      const local = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
      const slots = Array.from({ length: 8 * 96 }, (_, i) => new Date(Math.ceil(Date.now() / 900_000) * 900_000 + i * 900_000));
      const isMondayMorning = (d: Date) => /^Mon,? 09:[0-2]\d$/.test(local.format(d));
      const monday = slots.find(isMondayMorning)!;
      const queue = async (at: Date) =>
        (await (
          await request.post(`${localEnv("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/rpc/queue_weekly_summaries`, {
            headers: { apikey: localEnv("SUPABASE_SERVICE_ROLE_KEY"), authorization: `Bearer ${localEnv("SUPABASE_SERVICE_ROLE_KEY")}` },
            data: { p_now: at.toISOString() },
          })
        ).json()) as number;
      expect(await queue(new Date(monday.getTime() + 24 * 3_600_000))).toBe(0); // not on a Tuesday
      expect(await queue(monday)).toBe(1);
      expect(await queue(monday)).toBe(0); // once a week
      expect((await request.get("/api/jobs/run", { headers: { authorization: `Bearer ${localEnv("CRON_SECRET")}` } })).ok()).toBe(true);

      let body: string | null = null;
      await expect.poll(async () => (body = await emailText("demo@basenine.test", "Weekly summary:")), { timeout: 20_000 }).not.toBeNull();
      expect(body).toContain("Acme (demo site)");
      expect(body).toMatch(/\d+ came in, \d+ closed this week/);
      expect(body).toMatch(/\d+ open, \d+ in progress/);
      expect(body).toContain(`/p/${PROJECT}/board`);
    } finally {
      await page.goto("/account");
      if (await weekly.isChecked()) await toggle();
      await expect(weekly).not.toBeChecked();
    }
  });
});

test.describe("export", () => {
  test("the board exports every comment as a CSV file; signed-out visitors get nothing", async ({ page, request }) => {
    await login(page);
    await page.goto(`/p/${PROJECT}/board`);
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
    expect(download.suggestedFilename()).toMatch(/-feedback\.csv$/);
    const csv = (await (await page.request.get(`/p/${PROJECT}/export`)).text()).replace(/^\uFEFF/, "");
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Number,Status,Priority,Category,Title,Comment,Author,From,Assignee,Page,Element,Webflow classes,Device,Client sign-off,Created,Resolved,Link");
    expect(csv).toContain("Logo should be bigger");
    expect(csv).toContain("Robin Client,Client"); // names and who it came from, not ids
    expect(csv).toContain("Confirmed by client");

    const anonymous = await request.get(`/p/${PROJECT}/export`, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(307);
    expect(anonymous.headers().location).toContain("/login");
  });
});

test.describe("widget API security", () => {
  test("rejects missing and forged credentials", async ({ request }) => {
    const none = await request.get("/api/widget/me", { headers: { origin: SITE } });
    expect(none.status()).toBe(401);
    const forged = await request.get("/api/widget/me", { headers: { origin: SITE, authorization: "Bearer eyJhbGciOiJub25lIn0.e30." } });
    expect(forged.status()).toBe(401);
  });

  test("a valid token cannot be used from a different site", async ({ page, request }) => {
    await login(page);
    await page.goto(`/p/${PROJECT}/settings`);
    await page.getByRole("button", { name: "Create link" }).click();
    const link = await page.locator('input[readonly][value*="/s/"]').inputValue();
    await page.goto(link);
    await page.getByLabel("Your name").fill("Token Tester");
    await page.getByLabel("Email").fill("tester@client.test");
    // The token travels in the URL fragment, which never reaches any server; catch it on navigation.
    const nav = page.waitForEvent("framenavigated", (f) => f.url().includes("bn_token="));
    await page.getByRole("button", { name: /start reviewing/i }).click();
    const token = decodeURIComponent(/bn_token=([^&]+)/.exec((await nav).url())![1]!);

    const ok = await request.get("/api/widget/me", { headers: { origin: SITE, authorization: `Bearer ${token}` } });
    expect(ok.status()).toBe(200);
    const stolen = await request.get("/api/widget/me", { headers: { origin: "https://evil.example", authorization: `Bearer ${token}` } });
    expect(stolen.status()).toBe(403);
  });
});

test.describe("API for coding agents", () => {
  test("a personal token reads, replies to and resolves feedback over REST and MCP, until it is revoked", async ({ page, request }) => {
    await login(page);
    await page.goto("/account");
    const tokenName = unique("e2e agent");
    await page.getByLabel("Token name").fill(tokenName);
    await page.getByRole("button", { name: "Create token" }).click();
    const token = await page.getByLabel("New API token").inputValue();
    const auth = { authorization: `Bearer ${token}` };

    // REST v1
    const missing = await request.get("/api/v1/feedback");
    expect(missing.status()).toBe(401);
    expect(missing.headers()["www-authenticate"]).toContain("Bearer");
    const list = await request.get("/api/v1/feedback?limit=50", { headers: auth });
    expect(list.status()).toBe(200);
    const { feedback } = (await list.json()) as { feedback: { id: string; number: number; summary: string; status: string }[] };
    expect(feedback.length).toBeGreaterThan(0);
    expect(feedback.every((f) => f.status !== "resolved")).toBe(true); // unresolved by default
    const item = feedback[0]!;
    const one = await (await request.get(`/api/v1/feedback/${item.id}`, { headers: auth })).json();
    expect(one.feedback.markdown).toContain(`## Feedback #${item.number}`);
    expect((await request.get("/api/v1/feedback/00000000-0000-4000-8000-000000000000", { headers: auth })).status()).toBe(404);

    // MCP over Streamable HTTP, as Claude Code calls it
    let rpcId = 0;
    const mcp = async (method: string, params?: unknown) => {
      const res = await request.post("/api/mcp", {
        headers: { ...auth, accept: "application/json, text/event-stream", "content-type": "application/json" },
        data: { jsonrpc: "2.0", id: ++rpcId, method, params },
      });
      expect(res.status()).toBe(200);
      return (await res.json()).result;
    };
    const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
    expect(init.serverInfo.name).toBe("basenine-feedback");
    const { tools } = await mcp("tools/list");
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual(["get_feedback", "list_feedback", "reply", "set_status"]);
    const call = async (name: string, args: Record<string, unknown>) => ((await mcp("tools/call", { name, arguments: args })).content[0].text as string);
    expect(await call("list_feedback", { limit: 50 })).toContain(`id: ${item.id}`);
    expect(await call("get_feedback", { id: item.id })).toContain(`## Feedback #${item.number}`);
    const replyText = unique("Done via MCP");
    expect(await call("reply", { id: item.id, body: replyText })).toBe("Reply posted.");
    expect(await call("set_status", { id: item.id, status: "resolved" })).toBe(`#${item.number} is now resolved.`);

    // The team sees the agent's work, attributed to the token's owner.
    await page.goto(`/p/${PROJECT}?c=${item.id}`);
    const detail = page.getByRole("article", { name: `Comment ${item.number}` });
    await expect(detail.getByText(replyText)).toBeVisible();
    await expect(detail.getByLabel("Status")).toHaveValue("resolved");

    // Revoked tokens stop working immediately.
    await page.goto("/account");
    await page.getByRole("listitem").filter({ hasText: tokenName }).getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: tokenName })).toContainText("revoked");
    expect((await request.get("/api/v1/feedback", { headers: auth })).status()).toBe(401);
  });
});

test.describe("webhooks", () => {
  test("a project announces its events to a URL, signed, and a test delivery proves the connection", async ({ page }) => {
    // A stand-in for Slack, n8n or Zapier: records what it is sent.
    const received: { event: string; signature: string; body: string }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ event: String(req.headers["x-basenine-event"]), signature: String(req.headers["x-basenine-signature"]), body });
        res.writeHead(200).end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(4011, resolve));
    const url = `http://localhost:4011/hook-${Date.now().toString(36)}`;
    try {
      await login(page);
      await page.goto(`/p/${PROJECT}/settings`);
      await page.getByLabel("Webhook URL").fill(url);
      await page.getByRole("button", { name: "Add webhook" }).click();
      const row = page.getByRole("listitem").filter({ hasText: url });
      await row.getByRole("button", { name: "Send test" }).click();
      await expect(row).toContainText("Test delivered (HTTP 200)");

      // The receiver can prove the request came from this project: the body is signed with its secret.
      await row.getByRole("button", { name: "Signing secret" }).click();
      const secret = (await row.locator("span.break-all").textContent())!;
      const ping = received.find((r) => r.event === "ping")!;
      expect(ping.signature).toBe(`sha256=${createHmac("sha256", secret).update(ping.body).digest("hex")}`);

      // A real event: a new comment arrives with a ready sentence and a link back.
      const text = unique("Shorten this call to action");
      await page.goto(`/p/${PROJECT}`);
      const site = await siteFrame(page);
      await site.locator(".section_cta h2").click();
      await site.getByPlaceholder("What should change?").fill(text);
      await site.getByRole("button", { name: "Send" }).click();
      await expect.poll(() => received.find((r) => r.event === "comment.created" && r.body.includes(text))?.body ?? "", { timeout: 20_000 }).not.toBe("");
      const event = JSON.parse(received.find((r) => r.event === "comment.created" && r.body.includes(text))!.body);
      expect(event.text).toMatch(/^New comment #\d+ on .+ from .+: "/);
      expect(event.comment.url).toContain(`/p/${PROJECT}?page=`);
      expect(event.comment.element).toBeTruthy();

      await page.goto(`/p/${PROJECT}/settings`);
      await page.getByRole("listitem").filter({ hasText: url }).getByRole("button", { name: "Remove" }).click();
      await expect(page.getByRole("listitem").filter({ hasText: url })).toHaveCount(0);
    } finally {
      server.close();
    }
  });
});
