import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

// No sign-up here: the manager account is created by hand in Supabase.
const GerantConnexion = () => {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/gerant";

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (!loading && session) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: motDePasse });
    setEnvoi(false);
    if (error) {
      setErreur("E-mail ou mot de passe incorrect.");
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <main className="container flex min-h-screen max-w-md flex-col justify-center py-8">
      <Card>
        <CardHeader className="text-center">
          <h1 className="text-2xl font-semibold leading-none tracking-tight">Connexion du gérant</h1>
          <CardDescription>Accès réservé au salon.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mot-de-passe">Mot de passe</Label>
              <Input
                id="mot-de-passe"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
              />
            </div>
            {erreur && (
              <p role="alert" className="text-sm text-destructive">
                {erreur}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={envoi}>
              {envoi ? "Connexion…" : "Se connecter"}
            </Button>
          </form>
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

export default GerantConnexion;
