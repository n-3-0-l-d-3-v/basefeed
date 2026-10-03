# Figma → Webflow build system: feasibility, architecture, first milestone

A response to section 37 of the brief ("What I need from the developer before development"),
plus a working proof of concept of the deterministic core in [`packages/compiler`](../packages/compiler).

**How to read the claims here.** Three kinds, kept separate throughout:

- **Built**: runs today in this repo, covered by tests.
- **Documented**: stated in Webflow's or Figma's own developer docs (checked 3 Oct 2026). Not yet run by me on a real site.
- **Estimate**: my judgement. Needs measuring.

I have not had access to a Webflow site or a Basenine Figma file, so nothing below has been run
against the real platforms. The first milestone exists to change that.

---

## The short answer to the primary question

A constrained version can be built reliably today: **Basenine-spec Figma → Basenine starter in
Webflow**, section by section, with a person approving the mapping before anything is built.
The pipeline in the brief is right. I would change three things (section B), and the biggest one
is good news: Webflow's own docs now say elements, classes, components and variables can be
created **without the Designer open**.

---

## A. Feasibility

| | What |
|---|---|
| **Definitely feasible today** | Reading a frame from Figma's REST API (structure, Auto Layout, text, fills, image export). The semantic IR. The rules engine: token mapping, Client-First naming, reuse before creation, idempotency, name validation, build log (**built**, see below). Reading a Webflow site's existing classes, variables and components. Creating native elements, classes, variables and components programmatically (**documented** for both the Designer API and Webflow's MCP server). Asset upload through the Data API. A human approval step. |
| **Feasible but difficult** | Responsive: pairing the same element across a desktop and a mobile frame and expressing the difference as breakpoint styles. Matching a design to a component *with the right props and variant*. Visual QA that reports real differences and not font-rendering noise. Asset de-duplication. |
| **Limited by Webflow** | The Designer API styles classes only, not HTML tags. Classic interactions are not reachable; GSAP-based ones are. Visual snapshots and reading breakpoints or the current selection need a live Designer session. Page branches need Enterprise. Rollback is whatever site backups allow, which needs checking. |
| **Limited by Figma** | The Variables REST API is plan-restricted (the brief already assumes this), so tokens must also be recoverable from styles and naming. Rate limits: file and image endpoints allow 10 to 15 requests a minute on a Dev or Full seat, and roughly 20 a **month** on a View or Collab seat. The API token must belong to a paid seat, and responses must be cached per file version. |
| **Requires experimentation** | Whether creating a full page's elements through Webflow's server-side route is reliable at that volume. Build time per page. How well AI classifies Basenine's real, messy sections. Visual QA thresholds. |
| **Not currently practical** | Arbitrary Figma to arbitrary Webflow. Generating complex interactions, Rive, GSAP timelines or app-like UI. These should be detected and listed for manual work, as the brief says. |

## B. Recommended architecture

The brief's pipeline, with three changes.

```
Figma REST ─▶ Parser ─▶ Interpretation ─▶ IR ─▶ Rules engine ─▶ Build spec ─▶ Executor ─▶ Webflow
                        (names first,            (tokens, classes,   (keyed ops,    (interface: server-side
                         AI only for             reuse, validation)   validated)     or Designer Extension)
                         unnamed sections)                                │
                                             Human approval ◀────────────┘──▶ QA ─▶ Basenine Feedback
```

1. **The build spec is the contract, and the executor is swappable.** Everything up to the build
   spec is pure code with no Webflow dependency: testable, deterministic, replayable. The executor
   that applies it is an interface with two possible implementations: server-side (Webflow's API /
   MCP server), or a Designer Extension. Which one wins is the first thing to measure. If Webflow
   changes an API, only the executor changes.
2. **AI is narrower than in the diagram.** Interpretation is deterministic wherever the designer
   followed the authoring spec (`section/hero`). AI is asked only about sections the spec does not
   name, and its entire output is a pattern and a confidence. It cannot produce a class name, an
   element or a style, so "AI-generated class-name chaos" is impossible by construction.
3. **QA findings go into the feedback tool, not a separate report.** The feedback tool in this repo
   already pins comments to exact elements, detects when an element has changed since a comment,
   and tracks status. A visual-QA difference ("hero heading 18px lower than Figma") becomes a pinned
   comment on that heading; when the design engineer fixes it, the tool flags it as likely fixed.
   One board for client feedback and build QA.

Shared infrastructure already exists here and would be reused: a Postgres job queue with retries
and backoff (section 28), per-workspace isolation enforced in the database (sections 25 and 26),
an activity log of who did what (section 29), and a provider-independent AI layer that already
runs on Claude or Gemini (section 11).

## C. The Designer API constraint (section 3)

The brief's premise was true when written: the Designer API runs inside a Designer Extension in the
browser. What has changed is that Webflow now ships an MCP server, and its docs state:

> "Most of the server's work runs through the Data API and does not need the Bridge App. This
> includes creating and editing elements, components, styles, and variables […]"
> — developers.webflow.com/mcp/reference/how-it-works

Only snapshots, the current selection/page/mode, and reading breakpoints need the Designer open.
Answering the brief's questions on that basis:

| Question | Answer |
|---|---|
| Does a user need the Designer open during generation? | **Documented:** not for creating elements, classes, components or variables through the MCP server. Yes for visual snapshots. With a Designer Extension: always, one browser tab per site. |
| Can the extension receive a prepared build spec from a backend? | Yes. An extension is a web app; it can fetch JSON. This is why the build spec is the contract. |
| Can the backend do Figma and AI first, then send deterministic instructions? | **Built.** That is exactly what the proof of concept produces. |
| Can a build resume after an interruption? | **Built** at the planning level: every element has a key derived from its Figma node, so re-running computes only what is missing. |
| How long can a build run? Several pages in one session? | Unknown. Measured in the first milestone. |
| How do failed or partial builds recover? | Re-plan against what exists; apply the remainder. No manual restart. |
| What could limit scalability? | Webflow rate limits, the Designer-only capabilities above, and whether I can call the server-side route from our own backend rather than only through an AI client. That last point I could not confirm from the docs and is the first thing to test. |

## D. The smallest useful proof of concept

**Step 1, built:** the deterministic core, on a fixture shaped like a Figma API response.

```
pnpm --filter @bn/compiler demo
```

```
ANALYSIS
✓ navbar → existing component · 100%
✓ hero → hero (split) · 100%
✓ logos → logos (stack) · 100%
✓ features → features (3-column grid) · 100%
? product-demo → custom/manual (No build rule for "product-demo" yet: manual implementation)
? Frame 4127 → cta (stack, dark) · 60% · inferred, please confirm
✓ cta → cta (stack, dark) · 100%
✓ footer → existing component · 100%

BUILD PLAN
✓ 8 sections detected
✓ 6 built from rules, 2 left for manual work
✓ 3 existing components reused (Button, Footer, Navbar)
✓ 15 existing classes reused
✓ 15 classes to create (section_home_hero, home_hero_component, home_hero_content, …)
✓ 51 elements to create, 0 to update, 0 unchanged

Warnings:
- section/features gap: 30px is not a token; used spacing--lg (32px)
```

What the tests prove (14, including 300 random pages per run):

- The hero comes out as `section_home_hero › padding-global › container-large › padding-section-large › home_hero_component › home_hero_content`: the structure in section 8.
- **Reuse before creation:** no starter utility or component is ever recreated; only page-specific classes are created.
- **Idempotency:** running the same build twice changes nothing the second time. No `button-2`.
- **Delta updates:** a changed heading in Figma is one update, not a rebuild. A removed section is reported, not silently deleted.
- **Determinism:** same design and site in, same build out.
- **No guessing:** unsupported and low-confidence sections are never built until a person approves them.
- **Naming is enforced:** `div-274`, `container-copy-2` and duplicate classes fail validation and block the build.

**Step 2, about a week, needs access:** one hero section from a real Basenine Figma file, built into
a real starter site on a new page, through whichever execution route works. Run it twice. Measure
the time, the request count and what broke. That answers the open questions in section C with data.

## E. Timeline (estimates)

Assuming one person working with AI tooling, and access to the starter and real Figma files:

| Stage | Estimate | Outcome |
|---|---|---|
| Real-site spike | about 1 week | One section in Webflow, the execution route chosen, limits measured |
| MVP | 5 to 7 weeks after the spike | A homepage from a spec-compliant file: the 11 section types, desktop plus basic mobile, approval screen, build log |
| Production internal tool | a further 6 to 10 weeks | Multi-client, visual QA into the feedback tool, recovery, delta updates |

The executor is the uncertain part. If the server-side route works from our backend, the low end is
realistic. If everything must go through a Designer Extension, expect the high end.

## F. Effort by component

I am not quoting a price. As a share of the MVP's effort: Figma parser 10%, IR and interpretation
15%, rules engine 15%, Webflow executor 25% (the risk), internal app 10%, QA 15%, tests and docs 10%.

## G. Ongoing costs (estimates)

| | |
|---|---|
| Hosting and database | Free tiers now. About $45 a month at production (Vercel Pro and Supabase Pro), shared with the feedback tool. |
| AI | Used only for unnamed sections and visual QA, so a handful of calls per page. Likely under $50 a month at 5 to 10 sites a month; to be measured in the MVP. |
| Figma | One Dev or Full seat for the API token (see rate limits above). |
| Webflow | The existing workspace. Whether API or MCP access depends on plan needs confirming. |
| Monitoring | Free tier is enough at this scale. |

## H. The biggest risks

1. **The Webflow execution route.** Reliability and limits at page scale are unmeasured. *De-risk:* the spike; the executor is swappable.
2. **Responsive inference.** Easy to get plausible, hard to get right. *De-risk:* require a mobile frame in the authoring spec; infer tablet only.
3. **Figma discipline.** The system is only as reliable as the files. *De-risk:* a short authoring spec, and a linter that reports violations before a build rather than guessing.
4. **Visual QA noise.** False differences erode trust. *De-risk:* compare structure and measurements first, pixels second.
5. **Pattern sprawl.** Every new section type is a rule to maintain. *De-risk:* rules are data; unsupported sections fall back to manual, never to improvisation.

## I. What breaks when things change

| Change | What is affected |
|---|---|
| Webflow changes its APIs | The executor only. The build spec and everything before it are untouched. |
| Figma changes its API | The parser only (one file that maps Figma's fields to the IR). |
| AI models change | The classifier, behind an interface. It already runs on two providers in the feedback tool. |
| The design system evolves | The rules table, which is data: `1200 → container-large`, `48 → spacing-xl`. No code change for a new token. |

## J. Ownership

Everything is in this repository, runs on accounts Basenine controls (Figma, Webflow, hosting, AI
key), and has no dependency on me to operate. Tests and CI are part of the handover.

---

## Proposed Figma authoring spec (first draft)

- Each top-level layer of a page frame is a section named `section/<pattern>`: `section/hero`, `section/features`.
- Auto Layout on every section and on the frame that arranges its main parts.
- Buttons, navbar and footer are component instances (`Button/Primary`).
- Meaningful layers are named for their role: `eyebrow`, `heading`, `text`, `media`, `card`, `logo`.
- A desktop frame and a mobile frame per page.
- Spacing and type sizes come from the scale. Off-scale values are snapped and reported, not preserved.

Anything outside the spec is not an error: it is listed for confirmation or manual work.

## What I need to take the next step

- Access to the Basenine Webflow starter (or a copy), and one real, approved Figma page.
- The current class and token conventions, so the rules table matches how Basenine actually builds.
- A staging site for the feedback tool's embed script, so both tools can be tested on real Webflow output.
