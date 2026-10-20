import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Working hours of the signed-in employee (RLS returns only theirs). */
export function useMesHoraires() {
  return useQuery({
    queryKey: ["employe", "horaires"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("horaires")
        .select("id, jour_semaine, heure_debut, heure_fin")
        .order("jour_semaine")
        .order("heure_debut");
      if (error) throw error;
      return data;
    },
  });
}
