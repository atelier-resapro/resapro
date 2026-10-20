import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePrestations() {
  return useQuery({
    queryKey: ["prestations", "actives"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prestations")
        .select("*")
        .eq("active", true)
        .order("prix", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
