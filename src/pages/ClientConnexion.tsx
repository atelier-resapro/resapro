import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import SiteLayout from '@/components/SiteLayout';
import ClientCaptcha from '@/components/ClientCaptcha';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/hooks/useSession';
import { useProfil } from '@/hooks/useProfil';
import { supabase } from '@/integrations/supabase/client';
import { messageErreurCode, telephoneMobileInternational } from '@/lib/client-auth';

export default function ClientConnexion() {
  const { session, loading } = useSession();
  const profil = useProfil(session?.user.id);
  const queryClient = useQueryClient();
  const [telephone, setTelephone] = useState('');
  const [destination, setDestination] = useState('');
  const [code, setCode] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [pending, setPending] = useState(false);
  const [erreur, setErreur] = useState('');
  const [attente, setAttente] = useState(0);
  const onToken = useCallback((token: string) => setCaptcha(token), []);
  useEffect(() => {
    if (!attente) return;
    const timer = window.setTimeout(() => setAttente(attente - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [attente]);

  async function envoyer(event: FormEvent) {
    event.preventDefault();
    const phone = telephoneMobileInternational(telephone);
    if (!phone) { setErreur('Indiquez un numéro mobile français valide (06 ou 07).'); return; }
    if (!captcha || pending || attente) return;
    setPending(true); setErreur('');
    try {
      const { data, error } = await supabase.functions.invoke('demander-code-client', { body: { phone, captchaToken: captcha } });
      if (error) {
        let message = 'Envoi impossible. Veuillez réessayer.';
        try { message = (await error.context?.json())?.error ?? message; } catch { /* Network error */ }
        setErreur(message);
      } else if (!data?.ok) {
        setErreur(data?.error ?? 'Envoi impossible. Veuillez réessayer.');
      } else {
        setDestination(phone); setCode(''); setAttente(60);
      }
    } catch { setErreur('Connexion réseau impossible. Veuillez réessayer.'); }
    finally { setPending(false); setCaptcha(''); setCaptchaKey((key) => key + 1); }
  }
  async function verifier(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!/^\d{6}$/.test(code)) { setErreur('Saisissez les 6 chiffres du code reçu par SMS.'); return; }
    setPending(true); setErreur('');
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: destination, token: code, type: 'sms' });
      if (error) setErreur(messageErreurCode(error.code));
      else await queryClient.invalidateQueries({ queryKey: ['profil'] });
    } catch { setErreur('Connexion réseau impossible. Veuillez réessayer.'); }
    finally { setPending(false); }
  }

  if (loading || (session && profil.isLoading)) return <SiteLayout><p>Chargement…</p></SiteLayout>;
  if (session) return <SiteLayout>
    <h1 className="text-2xl font-bold">{profil.data === 'client' ? 'Vous êtes connecté' : 'Un compte est déjà connecté'}</h1>
    <p className="my-4">{profil.data === 'client' ? 'Votre connexion par téléphone a réussi.' : 'Votre session actuelle reste active.'}</p>
    {profil.isError && <p role="alert">Impossible de vérifier votre profil. Rechargez la page.</p>}
    <Link className="underline" to={profil.data === 'gerant' ? '/gerant' : profil.data === 'employe' ? '/employe' : '/reserver'}>
      {profil.data === 'client' ? 'Réserver un rendez-vous' : 'Continuer'}
    </Link>
    {profil.data === 'client' && <Button className="mt-6 block" variant="outline" onClick={async () => {
      const { error } = await supabase.auth.signOut();
      if (error) setErreur('Déconnexion impossible. Réessayez.');
      else { queryClient.clear(); setDestination(''); setCode(''); }
    }}>Se déconnecter</Button>}
    {erreur && <p role="alert">{erreur}</p>}
  </SiteLayout>;

  return <SiteLayout>
    <h1 className="text-2xl font-bold">Connexion client</h1>
    <p className="my-4 text-muted-foreground">Connectez-vous avec votre numéro de mobile. Aucun mot de passe : un code à usage unique vous est envoyé par SMS.</p>
    <form onSubmit={envoyer} className="space-y-4">
      <Label htmlFor="telephone-client">Numéro de téléphone</Label>
      <Input id="telephone-client" type="tel" autoComplete="tel" placeholder="06 12 34 56 78"
        required value={telephone} disabled={pending || !!destination} onChange={(e) => setTelephone(e.target.value)} />
      {(!destination || attente === 0) && <ClientCaptcha key={captchaKey} onToken={onToken} />}
      <Button type="submit" disabled={pending || !captcha || attente > 0}>
        {pending ? 'Envoi…' : destination ? 'Renvoyer un code' : 'Recevoir un code par SMS'}
      </Button>
      {attente > 0 && <p role="status">Nouvel envoi possible dans {attente} s.</p>}
    </form>
    {destination && <form onSubmit={verifier} className="mt-6 space-y-4">
      <p role="status">Code envoyé au {destination}. Saisissez-le sans tarder.</p>
      <Label htmlFor="code-client">Code reçu par SMS</Label>
      <Input id="code-client" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}"
        maxLength={6} value={code} required onChange={(e) => setCode(e.target.value)} />
      <Button type="submit" disabled={pending}>Se connecter</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={() => {
        setDestination(''); setCode(''); setErreur(''); setCaptcha(''); setCaptchaKey((key) => key + 1);
      }}>Changer de numéro</Button>
    </form>}
    {erreur && <p role="alert" className="mt-4 text-destructive">{erreur}</p>}
    <p className="mt-6 text-sm text-muted-foreground">Votre numéro sert à vous identifier et à gérer vos rendez-vous. Aucun SMS commercial n’est envoyé. Pour exercer vos droits d’accès ou de suppression, contactez le salon.</p>
  </SiteLayout>;
}
