import { createBrowserClient, createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl!, supabaseAnonKey!)
  : null;

const WORKSPACE_IDENTITY_KEY = "trackit_workspace_identity_v1";

type StoredWorkspaceIdentity = {
  actorId: string;
  ownerId: string;
};

function readWorkspaceIdentity(): StoredWorkspaceIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(WORKSPACE_IDENTITY_KEY) || "null") as StoredWorkspaceIdentity | null;
    if (!parsed?.actorId || !parsed.ownerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Makes existing client features workspace-aware without changing the auth
 * session: getUser() keeps the actor's email/metadata but exposes the owner id
 * as the data scope. The mapping is only honored for the actor who stored it.
 */
export function setWorkspaceClientIdentity(actorId: string, ownerId: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(WORKSPACE_IDENTITY_KEY, JSON.stringify({ actorId, ownerId }));
}

if (supabase && typeof window !== "undefined") {
  const auth = supabase.auth;
  const originalGetUser = auth.getUser.bind(auth);
  auth.getUser = (async (...args: Parameters<typeof originalGetUser>) => {
    const result = await originalGetUser(...args);
    const identity = readWorkspaceIdentity();
    const authUser = result.data.user;
    if (!authUser || !identity || authUser.id !== identity.actorId || identity.ownerId === authUser.id) {
      return result;
    }
    return {
      ...result,
      data: {
        ...result.data,
        user: { ...authUser, id: identity.ownerId },
      },
    };
  }) as typeof auth.getUser;
}

export function createSupabaseServerClient(options: {
  cookies: {
    getAll: () => Array<{ name: string; value: string }>;
    setAll: (cookiesToSet: Array<{
      name: string;
      value: string;
      options: unknown;
    }>) => void;
  };
}) {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createServerClient(supabaseUrl, supabaseAnonKey, options);
}

