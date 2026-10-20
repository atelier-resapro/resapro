import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Confirmed appointments of the signed-in employee between two days (included), sorted by start. */
export function useMonAgenda(debut: string, fin: string) {
  return useQuery({
    queryKey: ["employe", "agenda", debut, fin],
    queryFn: async () => {
      // Through a server function: it gives the client's name only, never the phone number.
      const { data, error } = await supabase.rpc("mon_agenda", { p_debut: debut, p_fin: fin });
      if (error) throw error;
      return data;
    },
  });
}
