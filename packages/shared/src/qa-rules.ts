// No imports here on purpose: the embed widget uses this table and must not pull in the validation library.

/**
 * Automated page checks (packages/widget/src/app/qa.ts). The label, category and priority of a
 * finding are fixed here, so they are never an opinion and never cost an AI call.
 */
export const QA_RULES = {
  alt: { title: "Image has no alt text", category: "content", priority: "medium" },
  "dead-link": { title: "Link goes nowhere", category: "bug", priority: "high" },
  "empty-control": { title: "Link or button has no readable name", category: "bug", priority: "medium" },
  "heading-empty": { title: "Empty heading", category: "content", priority: "medium" },
  "heading-order": { title: "Heading levels out of order", category: "layout", priority: "low" },
  "duplicate-id": { title: "Duplicate ID", category: "bug", priority: "low" },
  placeholder: { title: "Placeholder text left in", category: "copy", priority: "high" },
  "broken-image": { title: "Image fails to load", category: "bug", priority: "high" },
  overflow: { title: "Content wider than the screen", category: "layout", priority: "high" },
  contrast: { title: "Text is hard to read", category: "design", priority: "medium" },
} as const satisfies Record<string, { title: string; category: string; priority: string }>;
export type QaRule = keyof typeof QA_RULES;
