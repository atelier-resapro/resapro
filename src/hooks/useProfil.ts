import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Role = "gerant" | "employe" | "client";

/** Role of the signed-in account, or null when the account has no profile (no access). */
export function useProfil(userId: string | undefined) {
  return useQuery({
    queryKey: ["profil", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profils").select("role").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      return (data?.role as Role | undefined) ?? null;
    },
  });
}
