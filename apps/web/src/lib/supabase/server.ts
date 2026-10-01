import type { Database } from "@bn/shared";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, publicEnv } from "../env";

/** Acts as the signed-in user: every query is filtered by row-level security. */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session cookie instead.
        }
      },
    },
  });
}

let admin: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Bypasses row-level security. Only for code paths that have already authorized the caller
 * themselves (the widget API after verifying its token, background jobs).
 */
export function supabaseAdmin() {
  admin ??= createClient<Database>(publicEnv.supabaseUrl, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export async function currentUser() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}
