import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const EMAIL_DOMAIN = "tawreedat.app";

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
}

export type AppRole = "admin" | "supervisor" | "collector";

export type StaffPermissions = {
  collectors: boolean;
  deposits: boolean;
  collections: boolean;
};

export type AuthState = {
  userId: string;
  role: AppRole;
  isStaff: boolean;
  permissions: StaffPermissions;
  profile: {
    id: string;
    full_name: string;
    username: string;
    phone: string | null;
    active: boolean;
    branch_id: string | null;
    area_id: string | null;
    branch_name: string | null;
    area_name: string | null;
  } | null;
};

export async function fetchAuthState(): Promise<AuthState | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, username, phone, active, branch_id, area_id, branches(name), areas(name)")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
  ]);

  const roles = (rolesRes.data ?? []).map((r) => r.role as string);
  const role: "admin" | "collector" = roles.includes("admin") ? "admin" : "collector";
  const p = profileRes.data as
    | (Record<string, unknown> & { branches?: { name: string } | null; areas?: { name: string } | null })
    | null;

  return {
    userId: user.id,
    role,
    profile: p
      ? {
          id: p['id'] as string,
          full_name: p['full_name'] as string,
          username: p['username'] as string,
          phone: (p['phone'] as string | null) ?? null,
          active: p['active'] as boolean,
          branch_id: (p['branch_id'] as string | null) ?? null,
          area_id: (p['area_id'] as string | null) ?? null,
          branch_name: p.branches?.name ?? null,
          area_name: p.areas?.name ?? null,
        }
      : null,
  };
}

export function useAuth() {
  return useQuery({
    queryKey: ["auth-state"],
    queryFn: fetchAuthState,
    staleTime: 60_000,
  });
}

export function useSignOut() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/" });
  };
}
