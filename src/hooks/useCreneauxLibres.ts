import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Free start times of a service on a day, for one employee or (employeId null)
 * for all the employees who do it. Each start appears once, sorted.
 */
export function useCreneauxLibres(date: string | null, prestationId: string | null, employeId: string | null) {
  return useQuery({
    // Starts with ["creneaux-libres", date]: invalidating that key refreshes every choice.
    queryKey: ["creneaux-libres", date, prestationId, employeId],
    enabled: !!date && !!prestationId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("creneaux_libres_employes", {
        p_date: date!,
        p_prestation_id: prestationId!,
        ...(employeId ? { p_employe_id: employeId } : {}),
      });
      if (error) throw error;
      const debuts = new Map(data.map((c) => [new Date(c.debut).getTime(), c.debut]));
      return [...debuts.entries()].sort(([a], [b]) => a - b).map(([, debut]) => debut);
    },
  });
}
