import { expect, test } from "@playwright/test";
import { inbox, login, PROJECT, SITE, siteFrame, unique } from "./helpers";

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
    await guest.getByRole("button", { name: "Send" }).click();
    await expect(guest.getByRole("status")).toContainText(/Comment #\d+ added/);
    await client.close();

    await expect(page.getByText(text)).toBeVisible();

    // The team is emailed about the client's comment...
    await expect.poll(async () => (await inbox("demo@basenine.test")).some((m) => m.Snippet.includes(text)), { timeout: 20_000 }).toBe(true);

    // ...and when the team replies from the dashboard, the client is emailed the answer.
    const answer = unique("Yes, changing it to Book a call");
    await page.getByText(text).click();
    await page.getByLabel("Reply").fill(answer);
    await page.getByRole("button", { name: "Reply", exact: true }).click();
    await expect.poll(async () => (await inbox("casey@client.test")).some((m) => m.Snippet.includes(answer)), { timeout: 20_000 }).toBe(true);
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
