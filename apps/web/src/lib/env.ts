import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  APP_URL: z.url(),
  WIDGET_TOKEN_SECRET: z.string().min(32, "WIDGET_TOKEN_SECRET must be at least 32 characters"),
  CRON_SECRET: z.string().min(16),
  AI_PROVIDER: z.enum(["anthropic", "none"]).default("none"),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Server-only configuration, validated once on first use so a misconfigured deploy fails loudly. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
};
