import { Button } from "@/components/ui/button";

/** Signed in, but the account has no role for this space (no profile, or a profile read error). */
const AccesRefuse = ({ onDeconnecter }: { onDeconnecter: () => void }) => (
  <main className="container flex min-h-screen max-w-md flex-col justify-center gap-4 py-8 text-center">
    <h1 className="text-2xl font-semibold">Accès non autorisé</h1>
    <p role="alert" className="text-muted-foreground">
      Ce compte n'a pas accès à cet espace. Si vous pensez que c'est une erreur, contactez le gérant du salon.
    </p>
    <Button variant="outline" onClick={onDeconnecter}>
      Se déconnecter
    </Button>
  </main>
);

export default AccesRefuse;
