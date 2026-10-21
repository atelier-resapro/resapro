import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import SiteLayout from '@/components/SiteLayout';
import AccesRefuse from '@/components/AccesRefuse';
import ConfirmButton from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/hooks/useSession';
import { useProfil } from '@/hooks/useProfil';
import { useMesRendezVous, useCreneauxDeplacement } from '@/hooks/useMesRendezVous';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { formatJour, formatHeure, jourEtHeureSalon } from '@/lib/dates';
import { formatPrix } from '@/lib/format';
import { envoyerSms } from '@/lib/sms';

type RendezVous = Database['public']['Functions']['mes_rendez_vous']['Returns'][number];
function dateRendezVous(debut: string) {
  const { date, heure } = jourEtHeureSalon(debut);
  return `${formatJour(date)} · ${formatHeure(heure)}`;
}

function Deplacement({ rdv, userId, pending, onConfirm, onClose }: {
  rdv: RendezVous; userId: string; pending: boolean;
  onConfirm: (debut: string) => void; onClose: () => void;
}) {
  const [date, setDate] = useState(jourEtHeureSalon(rdv.debut).date);
  const [debut, setDebut] = useState('');
  const creneaux = useCreneauxDeplacement(userId, rdv.id, date);
  return <div role="region" aria-label="Déplacer le rendez-vous" className="mt-3 space-y-3 border-t pt-3">
    <p className="text-sm">Même prestation, avec {rdv.coiffeur}. Horaires du salon (Paris).</p>
    <Label htmlFor={`date-${rdv.id}`}>Nouvelle date</Label>
    <Input id={`date-${rdv.id}`} type="date" value={date} min={jourEtHeureSalon(new Date().toJSON()).date}
      disabled={pending} onChange={e => { setDate(e.target.value); setDebut(''); }} />
    {creneaux.isLoading && <p role="status">Chargement des horaires…</p>}
    {creneaux.isError && <p role="alert">Impossible de charger les horaires. <button className="underline" onClick={() => creneaux.refetch()}>Réessayer</button></p>}
    {date && creneaux.data?.filter(c => new Date(c.debut).getTime() !== new Date(rdv.debut).getTime()).length === 0 && <p>Aucun autre horaire disponible ce jour-là.</p>}
    <div role="group" aria-label="Horaires disponibles" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {creneaux.data?.filter(c => new Date(c.debut).getTime() !== new Date(rdv.debut).getTime()).map(c =>
        <Button key={c.debut} variant={debut === c.debut ? 'default' : 'outline'} disabled={pending}
          aria-pressed={debut === c.debut} onClick={() => setDebut(c.debut)}>
          {formatHeure(jourEtHeureSalon(c.debut).heure)}
        </Button>)}
    </div>
    {debut && <p className="text-sm">Nouvel horaire : {dateRendezVous(debut)} · {formatPrix(rdv.prix)}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!debut || pending} onClick={() => onConfirm(debut)}>Confirmer le déplacement</Button>
      <Button variant="outline" disabled={pending} onClick={onClose}>Fermer</Button>
    </div>
  </div>;
}

export default function ClientRendezVous() {
  const { session, loading } = useSession();
  const profil = useProfil(session?.user.id);
  const rdvs = useMesRendezVous(session?.user.id, profil.data === 'client');
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function deconnecter() {
    const { error } = await supabase.auth.signOut();
    if (error) { setErreur('Déconnexion impossible. Réessayez.'); return; }
    queryClient.clear();
  }
  async function modifier(id: string, debut?: string) {
    if (pending) return;
    setPending(true); setErreur('');
    try {
      const { error } = await supabase.rpc('modifier_mon_rendez_vous', {
        p_rendez_vous_id: id, ...(debut ? { p_debut: debut } : {}),
      });
      if (error) { setErreur(error.message); return; }
      setEdition(null);
      toast.success(debut ? 'Rendez-vous déplacé' : 'Rendez-vous annulé');
      const envoye = await envoyerSms(id, debut ? 'deplacement' : 'annulation');
      if (!envoye) toast.warning('La modification est enregistrée, mais certains SMS n’ont pas pu être envoyés.');
    } catch { setErreur('Connexion impossible. Réessayez.'); }
    finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client'] }),
        queryClient.invalidateQueries({ queryKey: ['gerant'] }),
        queryClient.invalidateQueries({ queryKey: ['creneaux-libres'] }),
        queryClient.invalidateQueries({ queryKey: ['recapitulatif', id] }),
      ]);
      setPending(false);
    }
  }

  if (loading || (session && profil.isLoading)) return <SiteLayout><p>Chargement…</p></SiteLayout>;
  if (!session) return <Navigate to="/client/connexion" replace />;
  if (profil.isError) return <SiteLayout><p role="alert">Impossible de vérifier votre profil.</p><Button onClick={() => profil.refetch()}>Réessayer</Button></SiteLayout>;
  if (profil.data !== 'client') return <AccesRefuse onDeconnecter={deconnecter} />;

  const aVenir = (rdvs.data ?? []).filter(r => r.statut === 'confirme' && new Date(r.fin).getTime() > now);
  const passes = (rdvs.data ?? []).filter(r => r.statut === 'confirme' && new Date(r.fin).getTime() <= now).reverse();
  const annules = (rdvs.data ?? []).filter(r => r.statut === 'annule').reverse();
  function carte(r: RendezVous, futur = false) {
    const modifiable = futur && new Date(r.debut).getTime() > now && new Date(r.modification_jusqua).getTime() >= now;
    return <li key={r.id} className="rounded-lg border bg-card p-3">
      <p className="font-semibold">{r.prestation} · {r.coiffeur}</p>
      <p className="text-sm first-letter:uppercase">{dateRendezVous(r.debut)}</p>
      <p className="text-sm text-muted-foreground">{Math.round((new Date(r.fin).getTime() - new Date(r.debut).getTime()) / 60000)} min · {formatPrix(r.prix)}
        {!futur && ` · ${r.statut === 'annule' ? 'Annulé' : 'Effectué'}`}</p>
      {modifiable ? <>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => { setEdition(r.id); setErreur(''); }}>Déplacer</Button>
          <ConfirmButton disabled={pending} question={`Annuler le rendez-vous du ${dateRendezVous(r.debut)} ?`}
            onConfirm={() => modifier(r.id)}>Annuler</ConfirmButton>
        </div>
        {edition === r.id && <Deplacement rdv={r} userId={session!.user.id} pending={pending}
          onClose={() => setEdition(null)} onConfirm={debut => modifier(r.id, debut)} />}
      </> : futur && <p className="mt-2 text-sm">Pour ce rendez-vous, appelez le salon</p>}
    </li>;
  }
  return <SiteLayout>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h1 className="text-xl font-bold">Mes rendez-vous</h1>
      <Button size="sm" variant="ghost" onClick={deconnecter}>Se déconnecter</Button>
    </div>
    {erreur && <p role="alert" className="mb-3 text-destructive">{erreur}</p>}
    {rdvs.isLoading && <p role="status">Chargement des rendez-vous…</p>}
    {rdvs.isError && <p role="alert">Impossible de charger vos rendez-vous. <button className="underline" onClick={() => rdvs.refetch()}>Réessayer</button></p>}
    {rdvs.data && <>
      <section aria-labelledby="a-venir">
        <h2 id="a-venir" className="mb-2 font-semibold">À venir</h2>
        {aVenir.length ? <ul className="space-y-2">{aVenir.map(r => carte(r, true))}</ul> : <p>Aucun rendez-vous à venir.</p>}
      </section>
      <Link to="/reserver" className="my-4 inline-block text-sm underline">Réserver un rendez-vous</Link>
      <section aria-labelledby="passes" className="border-t pt-4">
        <h2 id="passes" className="mb-2 font-semibold">Passés</h2>
        {passes.length ? <ul className="space-y-2">{passes.map(r => carte(r))}</ul> : <p>Aucun rendez-vous passé.</p>}
        {!!annules.length && <><h3 className="mb-2 mt-4 font-semibold">Annulés</h3><ul className="space-y-2 text-muted-foreground">{annules.map(r => carte(r))}</ul></>}
      </section>
    </>}
  </SiteLayout>;
}
