import { execSync } from "node:child_process";
import { join } from "node:path";

/** Every run starts from the seed, so results never depend on what a previous run left behind. */
export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  execSync("npx supabase db reset", { cwd: join(__dirname, "../../.."), stdio: "ignore" });
}
