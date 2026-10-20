import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ajouterJours, jourEtHeureSalon } from "@/lib/dates";

/** Confirmed appointments between two salon days (included), sorted by start. Manager only (RLS). */
export function useRendezVousGerant(debut: string, fin: string) {
  return useQuery({
    queryKey: ["gerant", "rendez-vous", debut, fin],
    queryFn: async () => {
      // Every appointment has `debut`, old system or not (creneau_id is null for the new one).
      // A one-day margin in UTC covers Paris time; the exact salon day is filtered below.
      const { data, error } = await supabase
        .from("rendez_vous")
        .select("id, statut, debut, clients(nom, telephone), prestations(nom), employes(nom)")
        .eq("statut", "confirme")
        .gte("debut", `${ajouterJours(debut, -1)}T00:00:00Z`)
        .lt("debut", `${ajouterJours(fin, 1)}T00:00:00Z`)
        .order("debut");
      if (error) throw error;
      return data
        .map((rdv) => ({ ...rdv, ...jourEtHeureSalon(rdv.debut) }))
        .filter((rdv) => rdv.date >= debut && rdv.date <= fin);
    },
  });
}
