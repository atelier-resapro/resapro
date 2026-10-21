import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMesRendezVous(userId: string | undefined, autorise: boolean) {
  return useQuery({
    queryKey: ['client', userId, 'rendez-vous'],
    enabled: !!userId && autorise,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('mes_rendez_vous');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreneauxDeplacement(userId: string, rendezVousId: string, date: string) {
  return useQuery({
    queryKey: ['creneaux-libres', date, 'deplacement', userId, rendezVousId],
    enabled: !!date,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('creneaux_deplacement_client', {
        p_rendez_vous_id: rendezVousId, p_date: date,
      });
      if (error) throw error;
      return data;
    },
  });
}
