import type { BuildSpec, Op, Site } from "./rules";

/** Stable fingerprint of what an element should be; a changed fingerprint is an update, not a new element. */
function fingerprint(op: Exclude<Op, { op: "class" }>): string {
  const { key: _key, source: _source, ...rest } = op;
  const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => x.localeCompare(y)));
  return JSON.stringify(sorted({ ...rest, ...("props" in rest ? { props: sorted(rest.props) } : {}) }));
}

export interface Plan {
  createClasses: string[];
  create: string[];
  update: string[];
  unchanged: string[];
  /** Built earlier for this page but no longer in the design. Reported for review, never auto-deleted. */
  orphaned: string[];
}

/**
 * What a build would actually change on the site. Every element has a key derived from its Figma
 * node, so a second run finds the first run's work instead of adding `button-2` beside it, and a
 * changed design produces a delta rather than a rebuild.
 */
export function plan(spec: BuildSpec, site: Site): Plan {
  const have = new Set(site.classes);
  const out: Plan = { createClasses: [], create: [], update: [], unchanged: [], orphaned: [] };
  const seen = new Set<string>();
  for (const op of spec.ops) {
    if (op.op === "class") {
      if (!have.has(op.name)) out.createClasses.push(op.name);
      continue;
    }
    seen.add(op.key);
    const before = site.built[op.key];
    if (before === undefined) out.create.push(op.key);
    else if (before !== fingerprint(op)) out.update.push(op.key);
    else out.unchanged.push(op.key);
  }
  out.orphaned = Object.keys(site.built).filter((k) => !seen.has(k));
  return out;
}

/** The site after the build: an in-memory stand-in for executing the spec through Webflow's API. */
export function apply(spec: BuildSpec, site: Site): Site {
  const classes = new Set(site.classes);
  const built = { ...site.built };
  for (const op of spec.ops) {
    if (op.op === "class") classes.add(op.name);
    else built[op.key] = fingerprint(op);
  }
  return { classes: [...classes].sort(), components: site.components, built };
}

const CUSTOM = /^(section_)?[a-z][a-z0-9]*(_[a-z0-9-]+){1,3}$/;
const UTILITY = /^[a-z]+(-[a-z0-9]+)+$|^button$/;
// What Figma exports and careless duplication leave behind: div-274, frame-wrapper-3, container-copy-2.
const JUNK = /^(div|frame|group|wrapper|rectangle)([-_]?\d+)?$|(^|[-_])copy([-_]?\d+)?$|[-_]\d+$/;

/**
 * The spec must look like deliberate Webflow work before it is allowed near a site: clean names,
 * nothing created twice, every element attached to something that exists. Any problem blocks the build.
 */
export function validate(spec: BuildSpec): string[] {
  const problems: string[] = [];
  const created = new Set<string>();
  const keys = new Set<string>();
  for (const op of spec.ops) {
    if (op.op === "class") {
      if (created.has(op.name)) problems.push(`Class "${op.name}" would be created twice`);
      created.add(op.name);
      continue;
    }
    if (keys.has(op.key)) problems.push(`Two elements share the key ${op.key}`);
    if (op.parent !== null && !keys.has(op.parent)) problems.push(`${op.key} is attached to ${op.parent}, which does not exist yet`);
    keys.add(op.key);
    if (op.op === "element")
      for (const c of op.classes) {
        if (JUNK.test(c)) problems.push(`"${c}" is a generated-looking class name`);
        else if (!CUSTOM.test(c) && !UTILITY.test(c)) problems.push(`"${c}" does not follow the naming rules`);
      }
  }
  return problems;
}
