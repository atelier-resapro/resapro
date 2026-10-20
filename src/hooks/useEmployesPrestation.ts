import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Employees who do a service: id and name only (through a server function). */
export function useEmployesPrestation(prestationId: string | null) {
  return useQuery({
    queryKey: ["employes-prestation", prestationId],
    enabled: !!prestationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("employes_prestation", { p_prestation_id: prestationId! });
      if (error) throw error;
      return data;
    },
  });
}
