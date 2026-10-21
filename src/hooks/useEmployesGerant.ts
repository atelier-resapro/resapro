import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Every employee, with or without an account. Manager only (RLS). */
export function useEmployesGerant() {
  return useQuery({
    queryKey: ["gerant", "employes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employes")
        .select("id, nom, actif, est_gerant, user_id, telephone")
        .order("est_gerant", { ascending: false })
        .order("nom");
      if (error) throw error;
      return data;
    },
  });
}
