import type { Section } from "./ir";
import type { Plan } from "./plan";
import { BUILD_THRESHOLD, type BuildSpec } from "./rules";

/** The review screen before anything is built: each section, what it maps to, and how sure we are. */
export function analysis(sections: Section[]): string {
  return sections
    .map((s) => {
      const sure = `${Math.round(s.confidence * 100)}%`;
      const name = s.name.replace(/^section\//i, "");
      if (!s.pattern) return `? ${name} → custom/manual (${s.flags[0] ?? "no rule"})`;
      if (s.pattern === "navbar" || s.pattern === "footer") return `✓ ${name} → existing component · ${sure}`;
      const mark = s.confidence >= BUILD_THRESHOLD ? "✓" : "?";
      const shape = s.layout.type === "grid" ? `${s.layout.columns}-column grid` : s.layout.type;
      return `${mark} ${name} → ${s.pattern} (${shape}${s.theme === "dark" ? ", dark" : ""}) · ${sure}${s.how === "inferred" ? " · inferred, please confirm" : ""}`;
    })
    .join("\n");
}

/** The build log: what was read, reused, created and left for a person. */
export function log(sections: Section[], spec: BuildSpec, p: Plan): string {
  const built = sections.length - spec.manual.length;
  const assets = spec.ops.filter((o) => o.op === "element" && o.asset).length;
  const lines = [
    `✓ ${sections.length} sections detected`,
    `✓ ${built} built from rules, ${spec.manual.length} left for manual work`,
    `✓ ${spec.reusedComponents.length} existing components reused (${spec.reusedComponents.join(", ") || "none"})`,
    `✓ ${spec.reusedClasses.length} existing classes reused`,
    `✓ ${p.createClasses.length} classes to create${p.createClasses.length ? ` (${p.createClasses.join(", ")})` : ""}`,
    `✓ ${assets} assets referenced`,
    `✓ ${p.create.length} elements to create, ${p.update.length} to update, ${p.unchanged.length} unchanged`,
  ];
  const warnings = [...spec.manual.map((m) => `${m.section}: ${m.reason}`), ...spec.warnings, ...(p.orphaned.length ? [`${p.orphaned.length} elements from an earlier build are no longer in the design`] : [])];
  return warnings.length ? `${lines.join("\n")}\n\nWarnings:\n${warnings.map((w) => `- ${w}`).join("\n")}` : lines.join("\n");
}
