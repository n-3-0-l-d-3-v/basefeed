import { describe, expect, it } from "vitest";
import { audit, contrastOf } from "../src/app/qa";

// jsdom has no layout, so every element counts as visible and the layout rules are switched off;
// those (overflow, contrast on a real page, image loading) are covered end to end in the browser.
const check = (html: string) => {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = html;
  return audit(doc, { visible: () => true, layout: false }).map((f) => `${f.rule}: ${f.message}`);
};

describe("page check", () => {
  it("finds nothing on a clean page", () => {
    expect(check('<h1>Title</h1><h2>Section</h2><p>Copy</p><a href="/pricing">Pricing</a><img src="a.png" alt="A truck"><img src="b.png" alt="">')).toEqual([]);
  });

  it("flags links that go nowhere, by their text", () => {
    expect(check('<a href="#">Learn more</a><a>Docs</a><a href="javascript:void(0)">Open</a><a href="#pricing">Jump</a>')).toEqual([
      'dead-link: The link "Learn more" goes nowhere (href="#").',
      'dead-link: The link "Docs" goes nowhere (no href).',
      'dead-link: The link "Open" goes nowhere (href="javascript:void(0)").',
    ]);
  });

  it("flags images without alt text, but not decorative ones", () => {
    expect(check('<img src="a.png"><img src="b.png" alt=""><img src="c.png" role="presentation">')).toEqual([
      "alt: This image has no alt text. Describe it, or mark it decorative with an empty alt.",
    ]);
  });

  it("flags controls a screen reader cannot name", () => {
    expect(check('<button></button><a href="/x"><img src="i.png" alt="Home"></a><button aria-label="Close"></button>')).toEqual([
      "empty-control: This button has no text or label, so screen readers announce nothing.",
    ]);
  });

  it("flags empty headings, skipped levels and a second H1", () => {
    expect(check("<h1>One</h1><h3>Three</h3><h2></h2><h1>Again</h1>")).toEqual([
      'heading-order: "Three" is an H3 right after an H1; a level is skipped.',
      "heading-empty: This H2 is empty.",
      'heading-order: There is more than one H1 on this page: "Again".',
    ]);
  });

  it("flags duplicate ids once, and leftover placeholder text", () => {
    expect(check('<div id="hero"></div><div id="hero"></div><div id="hero"></div><p>Lorem ipsum dolor sit amet</p>')).toEqual([
      'duplicate-id: The id "hero" is used more than once on this page.',
      "placeholder: Placeholder text (lorem ipsum) is still here.",
    ]);
  });

  it("leaves the feedback widget itself out", () => {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = '<div id="widget"><a href="#">x</a></div>';
    const host = doc.getElementById("widget")!;
    expect(audit(doc, { visible: () => true, layout: false, skip: (el) => host.contains(el) })).toEqual([]);
  });

  it("caps each rule so one systemic problem does not bury the rest", () => {
    expect(check('<a href="#">x</a>'.repeat(30)).length).toBe(8);
  });

  it("measures contrast against the nearest solid background", () => {
    document.body.innerHTML = '<div style="background-color: rgb(255,255,255)"><p id="grey" style="color: rgb(170,170,170)">Soft</p><p id="ink" style="color: rgb(10,10,10)">Sharp</p></div>';
    expect(contrastOf(document.getElementById("grey")!)!).toBeLessThan(3);
    expect(contrastOf(document.getElementById("ink")!)!).toBeGreaterThan(15);
  });
});
