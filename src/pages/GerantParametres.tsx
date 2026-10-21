import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function GerantParametres() {
  const queryClient = useQueryClient();
  const [delai, setDelai] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const reglage = useQuery({
    queryKey: ['gerant', 'parametres'],
    queryFn: async () => {
      const { data, error } = await supabase.from('parametres_salon').select('delai_modification_heures').eq('id', true).single();
      if (error) throw error;
      return data;
    },
  });
  async function enregistrer(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true); setMessage(''); setErreur('');
    try {
      const { error } = await supabase.from('parametres_salon')
        .update({ delai_modification_heures: Number(delai ?? reglage.data!.delai_modification_heures) })
        .eq('id', true).select('id').single();
      if (error) { setErreur('Impossible d’enregistrer le délai. Réessayez.'); return; }
      setDelai(null); setMessage('Délai enregistré.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gerant'] }),
        queryClient.invalidateQueries({ queryKey: ['client'] }),
        queryClient.invalidateQueries({ queryKey: ['creneaux-libres'] }),
      ]);
    } catch { setErreur('Connexion impossible. Réessayez.'); }
    finally { setPending(false); }
  }
  return <section>
    <h1 className="mb-4 text-2xl font-bold">Paramètres du salon</h1>
    {reglage.isLoading && <p>Chargement…</p>}
    {reglage.isError && <p role="alert">Impossible de charger les paramètres. <button onClick={() => reglage.refetch()}>Réessayer</button></p>}
    {reglage.data && <form className="max-w-md space-y-4" onSubmit={enregistrer}>
      <Label htmlFor="delai">Délai minimum avant déplacement ou annulation (heures)</Label>
      <Input id="delai" type="number" min="0" max="8760" step="1" required disabled={pending}
        value={delai ?? reglage.data.delai_modification_heures} onChange={e => setDelai(e.target.value)} aria-describedby="delai-aide" />
      <p id="delai-aide" className="text-sm text-muted-foreground">24 heures par défaut. Ce délai s’applique aussi aux rendez-vous déjà réservés. En dessous de ce délai, le client est invité à appeler le salon.</p>
      <Button disabled={pending} type="submit">{pending ? 'Enregistrement…' : 'Enregistrer'}</Button>
    </form>}
    {message && <p role="status" className="mt-3">{message}</p>}
    {erreur && <p role="alert" className="mt-3 text-destructive">{erreur}</p>}
  </section>;
}
