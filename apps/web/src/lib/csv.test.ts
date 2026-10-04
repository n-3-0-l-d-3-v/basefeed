import { describe, expect, it } from "vitest";
import { commentsToCsv, csvCell } from "./csv";
import type { DashboardComment } from "./data";

describe("csvCell", () => {
  it("leaves plain values alone", () => {
    expect(csvCell("Make it bigger")).toBe("Make it bigger");
    expect(csvCell(12)).toBe("12");
    expect(csvCell(null)).toBe("");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csvCell('Say "Book a demo", not "Start"')).toBe('"Say ""Book a demo"", not ""Start"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("makes a value that starts like a formula inert", () => {
    expect(csvCell('=HYPERLINK("https://evil.test","click")')).toBe(`"'=HYPERLINK(""https://evil.test"",""click"")"`);
    expect(csvCell("+1 for this")).toBe("'+1 for this");
    expect(csvCell("-webkit-box is broken")).toBe("'-webkit-box is broken");
    expect(csvCell("@sam can you check")).toBe("'@sam can you check");
  });
});

describe("commentsToCsv", () => {
  const c = {
    id: "c1",
    number: 7,
    page_id: "p1",
    body: "Headline too long,\nplease shorten",
    title: "Shorten the headline",
    category: "copy",
    status: "in_progress",
    priority: "high",
    author_name: "Priya Raman",
    author_user_id: null,
    author_guest_id: "g1",
    assignee_id: "u1",
    anchor: { selector: "h1.heading-style-h1", classes: ["heading-style-h1", "is-hero"] },
    context: { breakpoint: "mobile", viewport: { w: 390, h: 844 }, browser: "Safari 19", os: "iOS" },
    client_review: "pending",
    created_at: "2026-10-01T10:00:00Z",
    resolved_at: null,
  } as unknown as DashboardComment;

  const csv = commentsToCsv([c], { pageUrl: () => "https://acme.test/", memberName: () => "Sam Dev", link: () => "https://app.test/p/x?c=c1" });

  it("starts with a byte-order mark and a header row", () => {
    expect(csv.startsWith("﻿Number,Status,Priority,")).toBe(true);
  });

  it("writes one row per comment with names instead of ids", () => {
    const row = csv.split("\r\n")[1]!;
    expect(row).toBe(
      '7,in progress,high,copy,Shorten the headline,"Headline too long,\nplease shorten",Priya Raman,Client,Sam Dev,https://acme.test/,h1.heading-style-h1,heading-style-h1 is-hero,mobile · 390×844 · Safari 19 · iOS,Waiting for client,2026-10-01T10:00:00Z,,https://app.test/p/x?c=c1',
    );
  });
});
