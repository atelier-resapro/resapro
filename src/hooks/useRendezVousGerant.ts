import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Confirmed appointments between two days (included), sorted by day then time. Manager only (RLS). */
export function useRendezVousGerant(debut: string, fin: string) {
  return useQuery({
    queryKey: ["gerant", "rendez-vous", debut, fin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rendez_vous")
        .select("id, statut, clients(nom, telephone), prestations(nom), creneaux!inner(date, heure_debut)")
        .eq("statut", "confirme")
        .gte("creneaux.date", debut)
        .lte("creneaux.date", fin);
      if (error) throw error;
      return [...data].sort((a, b) =>
        `${a.creneaux.date} ${a.creneaux.heure_debut}`.localeCompare(`${b.creneaux.date} ${b.creneaux.heure_debut}`),
      );
    },
  });
}
