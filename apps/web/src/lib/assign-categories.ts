/** The categories a comment can be labelled with (by AI triage or the page check), as shown in assignment rules. */
export const ASSIGN_CATEGORIES = {
  copy: { label: "Copy", hint: "Wording and text changes" },
  content: { label: "Content", hint: "Images, media and data" },
  design: { label: "Design", hint: "Colour, type, spacing" },
  layout: { label: "Layout", hint: "Structure, alignment, responsive behaviour" },
  bug: { label: "Bug", hint: "Something is broken" },
  question: { label: "Question", hint: "The author is asking, not requesting" },
  other: { label: "Other", hint: "Anything else" },
} as const satisfies Record<string, { label: string; hint: string }>;
