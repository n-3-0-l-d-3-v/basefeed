import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../..");

/** A fresh database with the Acme demo project. (The config builds the demo site with its round-one edits.) */
export default async function globalSetup() {
  if (process.env.SCREENS_SKIP_RESET) return; // retake pictures on the data from the last run
  execSync("npx supabase db reset", { cwd: root, stdio: "ignore" });
  const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8");
  const email = /Demo login: (\S+) \//.exec(seed)![1]!;
  const sql = readFileSync(join(root, "supabase/demo/acme-demo.sql"), "utf8")
    .replace("YOUR-SIGNUP-EMAIL@example.com", email)
    .replace("https://YOUR-DEMO-SITE.vercel.app", "http://localhost:4000");
  execSync("docker exec -i supabase_db_feedback psql -U postgres -v ON_ERROR_STOP=1 -q", { input: sql, stdio: ["pipe", "ignore", "inherit"] });
  await fetch("http://127.0.0.1:56324/api/v1/messages", { method: "DELETE" }).catch(() => {});
}
