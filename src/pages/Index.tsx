import SiteLayout from "@/components/SiteLayout";
import PrestationCard from "@/components/PrestationCard";
import { usePrestations } from "@/hooks/usePrestations";

const Index = () => {
  const { data: prestations, isLoading, error } = usePrestations();

  return (
    <SiteLayout>
      <section className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-primary">RésaPro</h1>
        <p className="mt-2 text-lg text-muted-foreground">Votre rendez-vous coiffure, sans téléphoner</p>
      </section>

      <section aria-labelledby="titre-prestations">
        <h2 id="titre-prestations" className="mb-3 text-xl font-semibold">
          Nos prestations
        </h2>
        {isLoading && <p className="text-muted-foreground">Chargement des prestations…</p>}
        {error && (
          <p role="alert" className="text-destructive">
            Impossible de charger les prestations. Réessayez dans un instant.
          </p>
        )}
        {prestations && prestations.length === 0 && (
          <p className="text-muted-foreground">Aucune prestation disponible pour le moment.</p>
        )}
        <ul className="space-y-3">
          {prestations?.map((p) => (
            <li key={p.id}>
              <PrestationCard prestation={p} />
            </li>
          ))}
        </ul>
      </section>
    </SiteLayout>
  );
};

export default Index;
