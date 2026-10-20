import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRecapitulatif(rendezVousId: string | undefined) {
  return useQuery({
    queryKey: ["recapitulatif", rendezVousId],
    enabled: !!rendezVousId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("recapitulatif", { p_rendez_vous_id: rendezVousId! });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}
