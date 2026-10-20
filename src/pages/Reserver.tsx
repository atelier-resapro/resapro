import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import SiteLayout from "@/components/SiteLayout";
import DayPicker from "@/components/DayPicker";
import BookingForm from "@/components/BookingForm";
import SlotPicker from "@/components/SlotPicker";
import PrestationCard from "@/components/PrestationCard";
import { useEmployesPrestation } from "@/hooks/useEmployesPrestation";
import { usePrestations } from "@/hooks/usePrestations";
import { formatHeure, formatJour, prochainsJoursOuvrables, toHeure } from "@/lib/dates";
import { cn } from "@/lib/utils";

const choixClass = (selected: boolean) =>
  cn(
    "block w-full rounded-lg border bg-card p-4 text-left font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    selected && "ring-2 ring-primary",
  );

const Reserver = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { data: prestations, isLoading } = usePrestations();
  const [prestationId, setPrestationId] = useState<string | null>(params.get("prestation"));
  // null = "Indifférent", chosen by default.
  const [employeId, setEmployeId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [debut, setDebut] = useState<string | null>(null);

  const jours = useMemo(() => prochainsJoursOuvrables(12), []);
  const prestation = prestations?.find((p) => p.id === prestationId) ?? null;
  const { data: employes, isLoading: chargementEmployes } = useEmployesPrestation(prestation?.id ?? null);
  const employe = employes?.find((e) => e.employe_id === employeId) ?? null;
  const aDesEmployes = !!employes && employes.length > 0;

  return (
    <SiteLayout>
      <h1 className="mb-6 text-2xl font-bold">Prendre rendez-vous</h1>

      <section aria-labelledby="etape-prestation" className="mb-8">
        <h2 id="etape-prestation" className="mb-3 text-lg font-semibold">
          1. Choisissez une prestation
        </h2>
        {isLoading && <p className="text-muted-foreground">Chargement des prestations…</p>}
        <ul className="space-y-2">
          {prestations?.map((p) => {
            const selected = p.id === prestationId;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setPrestationId(p.id);
                    setEmployeId(null);
                    setDebut(null);
                  }}
                  className={cn(
                    "block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    selected && "ring-2 ring-primary",
                  )}
                >
                  <PrestationCard prestation={p} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {prestation && (
        <section aria-labelledby="etape-coiffeur" className="mb-8">
          <h2 id="etape-coiffeur" className="mb-3 text-lg font-semibold">
            2. Choisissez votre coiffeur
          </h2>
          {chargementEmployes && <p className="text-muted-foreground">Chargement des coiffeurs…</p>}
          {employes && !aDesEmployes && (
            <p className="text-muted-foreground">Aucun coiffeur ne propose cette prestation pour le moment.</p>
          )}
          {aDesEmployes && (
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  aria-pressed={employeId === null}
                  onClick={() => {
                    setEmployeId(null);
                    setDebut(null);
                  }}
                  className={choixClass(employeId === null)}
                >
                  Indifférent
                  <span className="block text-sm font-normal text-muted-foreground">Le premier coiffeur disponible</span>
                </button>
              </li>
              {employes.map((e) => (
                <li key={e.employe_id}>
                  <button
                    type="button"
                    aria-pressed={e.employe_id === employeId}
                    onClick={() => {
                      setEmployeId(e.employe_id);
                      setDebut(null);
                    }}
                    className={choixClass(e.employe_id === employeId)}
                  >
                    {e.employe_nom}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {prestation && aDesEmployes && (
        <section aria-labelledby="etape-jour" className="mb-8">
          <h2 id="etape-jour" className="mb-1 text-lg font-semibold">
            3. Choisissez un jour
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">Le salon est ouvert du mardi au samedi.</p>
          <DayPicker
            jours={jours}
            value={date}
            onChange={(iso) => {
              setDate(iso);
              setDebut(null);
            }}
          />
        </section>
      )}

      {prestation && aDesEmployes && date && (
        <section aria-labelledby="etape-creneau" className="mb-8">
          <h2 id="etape-creneau" className="mb-3 text-lg font-semibold">
            4. Choisissez un horaire : {formatJour(date)}
          </h2>
          <SlotPicker
            date={date}
            prestationId={prestation.id}
            employeId={employeId}
            value={debut}
            onChange={setDebut}
          />
        </section>
      )}

      {prestation && aDesEmployes && date && debut && (
        <section aria-labelledby="etape-coordonnees" className="mb-8">
          <h2 id="etape-coordonnees" className="mb-3 text-lg font-semibold">
            5. Vos coordonnées
          </h2>
          <p className="mb-4 rounded-md bg-muted p-3 text-sm">
            {prestation.nom}, {formatJour(date)} à {formatHeure(toHeure(new Date(debut)))},{" "}
            {employe ? `avec ${employe.employe_nom}` : "avec le premier coiffeur disponible"}.
          </p>
          {/* key: a new choice starts from a clean form (and clears any previous error) */}
          <BookingForm
            key={`${employeId}-${debut}`}
            prestationId={prestation.id}
            employeId={employeId}
            debut={debut}
            date={date}
            onBooked={(id) => navigate(`/confirmation/${id}`)}
          />
        </section>
      )}
    </SiteLayout>
  );
};

export default Reserver;
