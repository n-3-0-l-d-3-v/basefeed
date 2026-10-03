import { it } from "vitest";
import { acmeHome, starter } from "../fixtures/acme-home";
import { analysis, compile, interpretPage, log, plan, validate } from "../src";

// `pnpm --filter @bn/compiler demo` prints what the internal app would show before and after a build.
it("demo: analyse and plan the Acme homepage", () => {
  const sections = interpretPage(acmeHome());
  const spec = compile("home", sections, starter());
  const problems = validate(spec);
  console.log(`\nANALYSIS\n${analysis(sections)}\n\nBUILD PLAN\n${log(sections, spec, plan(spec, starter()))}\n\nVALIDATION: ${problems.length ? problems.join("; ") : "clean"}\n`);
});
