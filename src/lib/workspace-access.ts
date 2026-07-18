import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  HAYTAM_WORKSPACE_ADMIN_EMAIL,
  normalizeWorkspaceEmail,
  RAYAN_WORKSPACE_OWNER_EMAIL,
} from "@/lib/workspace-presets";

export type WorkspaceProfile = {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  business_name: string | null;
  shopify_store: string | null;
  plan: string | null;
  subscription_status: string | null;
  account_type: string | null;
  onboarding_completed: boolean | null;
};

export type WorkspaceContext = {
  actorId: string;
  actorEmail: string | null;
  ownerId: string;
  ownerEmail: string | null;
  delegated: boolean;
  role: "owner" | "admin";
  actorProfile: WorkspaceProfile | null;
  ownerProfile: WorkspaceProfile | null;
};

const PROFILE_SELECT =
  "id, full_name, username, avatar_url, business_name, shopify_store, plan, subscription_status, account_type, onboarding_completed";

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const found = data.users.find((user) => normalizeWorkspaceEmail(user.email) === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function loadProfile(userId: string): Promise<WorkspaceProfile | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();
  return (data as WorkspaceProfile | null) ?? null;
}

/**
 * Resolves the authenticated actor to the workspace they should operate in.
 * The explicit preset remains useful before the migration is deployed and
 * automatically persists the membership once both accounts exist.
 */
export async function resolveWorkspaceContextForUser(actor: User): Promise<WorkspaceContext> {
  const admin = getSupabaseAdmin();
  const actorEmail = normalizeWorkspaceEmail(actor.email);
  const storedActorProfile = await loadProfile(actor.id);
  const metadata = actor.user_metadata as Record<string, unknown> | undefined;
  const actorProfile: WorkspaceProfile = storedActorProfile ?? {
    id: actor.id,
    full_name:
      (typeof metadata?.full_name === "string" && metadata.full_name) ||
      (typeof metadata?.name === "string" && metadata.name) ||
      null,
    username:
      (typeof metadata?.username === "string" && metadata.username) ||
      actorEmail.split("@")[0] ||
      null,
    avatar_url: typeof metadata?.avatar_url === "string" ? metadata.avatar_url : null,
    business_name: null,
    shopify_store: null,
    plan: "free",
    subscription_status: null,
    account_type: null,
    onboarding_completed: null,
  };

  if (!admin || actorEmail !== HAYTAM_WORKSPACE_ADMIN_EMAIL) {
    return {
      actorId: actor.id,
      actorEmail: actor.email ?? null,
      ownerId: actor.id,
      ownerEmail: actor.email ?? null,
      delegated: false,
      role: "owner",
      actorProfile,
      ownerProfile: storedActorProfile,
    };
  }

  let ownerId: string | null = null;
  const { data: membership } = await admin
    .from("workspace_members")
    .select("owner_id")
    .eq("member_id", actor.id)
    .eq("role", "admin")
    .maybeSingle();
  ownerId = membership?.owner_id ? String(membership.owner_id) : null;

  if (!ownerId) {
    const owner = await findAuthUserByEmail(RAYAN_WORKSPACE_OWNER_EMAIL);
    ownerId = owner?.id ?? null;
    if (ownerId) {
      await admin
        .from("workspace_members")
        .upsert(
          { owner_id: ownerId, member_id: actor.id, role: "admin" },
          { onConflict: "owner_id,member_id" },
        );
    }
  }

  if (!ownerId) {
    throw new Error("The principal workspace account rayan@trackit does not exist yet.");
  }

  return {
    actorId: actor.id,
    actorEmail: actor.email ?? null,
    ownerId,
    ownerEmail: RAYAN_WORKSPACE_OWNER_EMAIL,
    delegated: true,
    role: "admin",
    actorProfile,
    ownerProfile: await loadProfile(ownerId),
  };
}

export async function canUserAccessWorkspace(actor: User, requestedOwnerId: string): Promise<boolean> {
  if (actor.id === requestedOwnerId) return true;
  const context = await resolveWorkspaceContextForUser(actor);
  return context.ownerId === requestedOwnerId;
}
