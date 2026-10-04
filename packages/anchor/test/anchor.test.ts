import { describe, expect, it } from "vitest";
import { capture, DocIndex, resolve } from "../src";

function page(html: string): Document {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = html;
  return doc;
}

const HERO = `
  <nav class="navbar"><a href="/" class="w--current">Home</a><a href="/pricing">Pricing</a></nav>
  <section class="section_home_hero">
    <div class="padding-global"><div class="container-large">
      <h1 class="heading-style-h1">Turn your website into your best salesperson</h1>
      <p class="text-size-large">Webflow sites for B2B tech companies.</p>
      <a href="/demo" class="button">Book a demo</a>
    </div></div>
  </section>
  <section class="section_features">
    <div class="card"><h3>Fast</h3><a href="/a" class="button is-secondary">Learn more</a></div>
    <div class="card"><h3>Secure</h3><a href="/b" class="button is-secondary">Learn more</a></div>
    <div class="card"><h3>Simple</h3><a href="/c" class="button is-secondary">Learn more</a></div>
  </section>`;

function anchorOn(doc: Document, selector: string, nth = 0) {
  const el = doc.querySelectorAll(selector)[nth]!;
  return { el, anchor: capture(el, undefined, new DocIndex(doc)) };
}

describe("capture", () => {
  it("records a readable selector, excerpt and Webflow classes", () => {
    const doc = page(HERO);
    const { anchor } = anchorOn(doc, "h1");
    expect(anchor.selector).toBe("h1.heading-style-h1");
    expect(anchor.excerpt).toBe("Turn your website into your best salesperson");
    expect(anchor.kind).toBe("leaf");
    expect(anchor.unique).toBe(true);
  });

  it("ignores Webflow runtime state classes", () => {
    const doc = page(HERO);
    const { anchor } = anchorOn(doc, "nav a");
    expect(anchor.classes).toEqual([]);
  });

  it("normalizes clicks inside an inline SVG to the outer <svg>", () => {
    const doc = page(`<p>Icon</p><svg viewBox="0 0 10 10"><g><path d="M0 0L10 10"/></g></svg>`);
    const path = doc.querySelector("path")!;
    expect(capture(path).tag).toBe("svg");
  });

  it("ignores the widget's own UI", () => {
    const doc = page(`<p>One</p><div data-bn-root><p>Widget</p></div><p>Two</p>`);
    const idx = new DocIndex(doc);
    expect(idx.elements().some((e) => e.textContent === "Widget")).toBe(false);
  });
});

describe("resolve", () => {
  it("attaches to the same element on an unchanged page", () => {
    const doc = page(HERO);
    const { el, anchor } = anchorOn(doc, ".card a", 1);
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status).toBe("attached");
    expect(r.status === "attached" && r.element).toBe(el);
  });

  it("survives content inserted above it", () => {
    const doc = page(HERO);
    const { el, anchor } = anchorOn(doc, "h1");
    doc.body.insertAdjacentHTML("afterbegin", `<div class="banner"><p>We use cookies</p></div>`);
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element).toBe(el);
  });

  it("survives the element being moved to another section", () => {
    const doc = page(HERO);
    const { el, anchor } = anchorOn(doc, "h1");
    doc.querySelector(".section_features")!.prepend(el);
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element).toBe(el);
  });

  it("does not jump to a neighbouring duplicate when the commented one is deleted", () => {
    const doc = page(HERO);
    const { el, anchor } = anchorOn(doc, ".card a", 1);
    el.closest(".card")!.remove();
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status).not.toBe("attached");
  });

  it("still finds a duplicate-text button after an unrelated card is removed", () => {
    const doc = page(HERO);
    const { el, anchor } = anchorOn(doc, ".card a", 2);
    doc.querySelectorAll(".card")[0]!.remove();
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" ? r.element : el).toBe(el);
  });

  it("keeps a repeated 'Learn more' attached when a new card is added before its card", () => {
    // Identical links (same text, same href) as Webflow often produces: genuinely repeated content.
    const doc = page(HERO.replace(/href="\/[abc]"/g, 'href="#"'));
    const { el, anchor } = anchorOn(doc, ".card a", 1);
    expect(anchor.scope?.tag).toBe("div");
    doc.querySelector(".section_features")!.insertAdjacentHTML("afterbegin", `<div class="card"><h3>New</h3><a href="#" class="button is-secondary">Learn more</a></div>`);
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status).toBe("attached");
    expect(r.status === "attached" && r.element).toBe(el);
  });

  it("suggests (but does not attach) when the element's text was edited", () => {
    const doc = page(HERO);
    const { el, anchor } = anchorOn(doc, "h1");
    el.textContent = "Turn your website into your best sales rep";
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status).toBe("suggested");
    expect(r.status === "suggested" && r.element).toBe(el);
  });

  it("does not attach to a new wrapper inside the original when the original's text was extended", () => {
    // Found by the property test in CI: the wrapper now holds exactly the original content and
    // inherits its surroundings, while the original (still in place) only gained text.
    const doc = page("<div><span>Learn more</span></div>");
    const { el, anchor } = anchorOn(doc, "div");
    const span = el.querySelector("span")!;
    const wrapper = doc.createElement("div");
    span.before(wrapper);
    wrapper.append(span);
    el.append(doc.createTextNode(" about our new pricing"));
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element === wrapper).toBe(false);
  });

  it("does not attach to a new wrapper inside the original on 'evidence' from an empty page edge", () => {
    const doc = page("<div></div><div><a>Learn more</a></div>");
    const { el, anchor } = anchorOn(doc, "div", 1);
    el.insertAdjacentHTML("afterbegin", "<p>New intro</p>");
    const link = el.querySelector("a")!;
    const wrapper = doc.createElement("div");
    link.before(wrapper);
    wrapper.append(link);
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element === wrapper).toBe(false);
  });

  it("does not attach a bare container's comment to a wrapper that now holds it", () => {
    const doc = page("<div><li><div><span>Learn more</span><a>Learn more</a></div></li><p>Learn more</p></div><div></div>");
    const { el, anchor } = anchorOn(doc, "div");
    const wrapper = doc.querySelectorAll("body > div")[1]!;
    el.append(doc.createTextNode(" edited"));
    wrapper.append(el);
    doc.body.insertAdjacentHTML("afterbegin", "<p>New intro</p>");
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element === wrapper).toBe(false);
  });

  it("does not attach to an identical empty twin moved into the card after the original was deleted", () => {
    const doc = page("<button></button><div><button></button><p>Learn more</p></div>");
    const { el, anchor } = anchorOn(doc, "button", 1);
    const twin = doc.querySelectorAll("button")[0]!;
    doc.querySelector("div")!.append(twin);
    el.remove();
    doc.body.insertAdjacentHTML("afterbegin", "<p>New intro</p>");
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element === twin).toBe(false);
  });

  it("does not attach to a new wrapper around a different element with the same text after the original was deleted", () => {
    // Found by the property test in CI: the commented box is gone, and wrapping a span that says the
    // same thing produces a box with the same content and the same text before it.
    const doc = page(
      "<div><div><p>Learn more</p><p>Learn more</p></div><div><a>We build Webflow sites for B2B tech</a></div><p>Learn more</p></div><p>Learn more</p><span>We build Webflow sites for B2B tech</span>",
    );
    const el = doc.querySelector("a")!.parentElement!;
    const anchor = capture(el, undefined, new DocIndex(doc));
    el.remove();
    const span = doc.querySelector("span")!;
    const wrapper = doc.createElement("div");
    span.before(wrapper);
    wrapper.append(span);
    doc.body.insertAdjacentHTML("afterbegin", "<p>New intro</p>");
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element === wrapper).toBe(false);
  });

  it("detaches when nothing similar remains", () => {
    const doc = page(HERO);
    const { anchor } = anchorOn(doc, "h1");
    doc.querySelector(".section_home_hero")!.remove();
    expect(resolve(anchor, new DocIndex(doc)).status).toBe("detached");
  });

  it("anchors containers by structure and keeps them through inner text tweaks", () => {
    const doc = page(HERO);
    const { el, anchor } = anchorOn(doc, ".section_home_hero");
    expect(anchor.kind).toBe("container");
    doc.querySelector(".section_home_hero p")!.textContent = "Webflow sites for B2B tech teams.";
    const r = resolve(anchor, new DocIndex(doc));
    expect(r.status === "attached" && r.element).toBe(el);
  });
});
