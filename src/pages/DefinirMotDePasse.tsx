import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

const LONGUEUR_MIN = 8;

/**
 * Landing page of the invitation link: Supabase opens a session from the link,
 * the employee chooses a password, then goes to their agenda.
 */
const DefinirMotDePasse = () => {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (loading) {
    return <p className="p-6 text-muted-foreground">Chargement…</p>;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    if (motDePasse.length < LONGUEUR_MIN) {
      return setErreur(`Le mot de passe doit contenir au moins ${LONGUEUR_MIN} caractères.`);
    }
    if (motDePasse !== confirmation) {
      return setErreur("Les deux mots de passe ne sont pas identiques.");
    }
    setEnvoi(true);
    const { error } = await supabase.auth.updateUser({ password: motDePasse });
    setEnvoi(false);
    if (error) {
      setErreur("Le mot de passe n'a pas pu être enregistré. Essayez-en un autre.");
      return;
    }
    // The layouts send each role to its own space.
    navigate("/employe", { replace: true });
  };

  return (
    <main className="container flex min-h-screen max-w-md flex-col justify-center py-8">
      <Card>
        <CardHeader className="text-center">
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Choisir votre mot de passe</h1>
          <CardDescription>Vous l'utiliserez pour vous connecter à RésaPro.</CardDescription>
        </CardHeader>
        <CardContent>
          {!session ? (
            <p role="alert" className="text-sm text-destructive">
              Ce lien n'est plus valide. Demandez une nouvelle invitation au gérant du salon.
            </p>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nouveau-mot-de-passe">Mot de passe ({LONGUEUR_MIN} caractères minimum)</Label>
                <Input
                  id="nouveau-mot-de-passe"
                  type="password"
                  autoComplete="new-password"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmation-mot-de-passe">Confirmez le mot de passe</Label>
                <Input
                  id="confirmation-mot-de-passe"
                  type="password"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              {erreur && (
                <p role="alert" className="text-sm text-destructive">
                  {erreur}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={envoi}>
                {envoi ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link to="/" className="text-muted-foreground underline-offset-4 hover:underline">
          Retour au site
        </Link>
      </p>
    </main>
  );
};

export default DefinirMotDePasse;
