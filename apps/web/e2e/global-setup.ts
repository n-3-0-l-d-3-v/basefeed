import { execSync } from "node:child_process";
import { join } from "node:path";

/** Every run starts from the seed, so results never depend on what a previous run left behind. */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  execSync("npx supabase db reset", { cwd: join(__dirname, "../../.."), stdio: "ignore" });
  await fetch("http://127.0.0.1:56324/api/v1/messages", { method: "DELETE" }).catch(() => {});
}
