import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCreneauxLibres(date: string | null) {
  return useQuery({
    queryKey: ["creneaux-libres", date],
    enabled: !!date,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("creneaux_libres", { p_date: date! });
      if (error) throw error;
      return data;
    },
  });
}
