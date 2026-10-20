import { Link, useParams } from "react-router-dom";
import SiteLayout from "@/components/SiteLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useRecapitulatif } from "@/hooks/useRecapitulatif";
import { formatHeure, formatJour } from "@/lib/dates";
import { formatPrix } from "@/lib/format";

const Confirmation = () => {
  const { id } = useParams<{ id: string }>();
  const { data: recap, isLoading, error } = useRecapitulatif(id);

  return (
    <SiteLayout>
      {isLoading && <p className="text-muted-foreground">Chargement…</p>}

      {(error || (!isLoading && !recap)) && (
        <div role="alert" className="space-y-4 text-center">
          <p className="text-destructive">Nous n'avons pas retrouvé ce rendez-vous.</p>
          <Button asChild>
            <Link to="/">Retour à l'accueil</Link>
          </Button>
        </div>
      )}

      {recap && (
        <Card>
          <CardHeader className="items-center text-center">
            <div
              aria-hidden="true"
              className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-3xl text-primary-foreground"
            >
              ✓
            </div>
            <h1 className="text-2xl font-semibold leading-none tracking-tight">Rendez-vous confirmé</h1>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Prestation</dt>
                <dd className="font-medium">{recap.prestation}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Jour</dt>
                <dd className="font-medium">{formatJour(recap.jour)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Heure</dt>
                <dd className="font-medium">{formatHeure(recap.heure)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted-foreground">Prix</dt>
                <dd className="font-medium">{formatPrix(recap.prix)}</dd>
              </div>
            </dl>
            <Button asChild size="lg" className="mt-6 w-full">
              <Link to="/">Retour à l'accueil</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </SiteLayout>
  );
};

export default Confirmation;
