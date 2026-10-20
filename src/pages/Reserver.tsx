import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SiteLayout from "@/components/SiteLayout";
import DayPicker from "@/components/DayPicker";
import SlotPicker from "@/components/SlotPicker";
import PrestationCard from "@/components/PrestationCard";
import { usePrestations } from "@/hooks/usePrestations";
import { formatJour, prochainsJoursOuvrables } from "@/lib/dates";
import { cn } from "@/lib/utils";

const Reserver = () => {
  const [params] = useSearchParams();
  const { data: prestations, isLoading } = usePrestations();
  const [prestationId, setPrestationId] = useState<string | null>(params.get("prestation"));
  const [date, setDate] = useState<string | null>(null);
  const [creneauId, setCreneauId] = useState<string | null>(null);

  const jours = useMemo(() => prochainsJoursOuvrables(12), []);
  const prestation = prestations?.find((p) => p.id === prestationId) ?? null;

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
                    setCreneauId(null);
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
        <section aria-labelledby="etape-jour" className="mb-8">
          <h2 id="etape-jour" className="mb-1 text-lg font-semibold">
            2. Choisissez un jour
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">Le salon est ouvert du mardi au samedi.</p>
          <DayPicker
            jours={jours}
            value={date}
            onChange={(iso) => {
              setDate(iso);
              setCreneauId(null);
            }}
          />
        </section>
      )}

      {prestation && date && (
        <section aria-labelledby="etape-creneau" className="mb-8">
          <h2 id="etape-creneau" className="mb-3 text-lg font-semibold">
            3. Choisissez un horaire : {formatJour(date)}
          </h2>
          <SlotPicker date={date} value={creneauId} onChange={(id) => setCreneauId(id)} />
        </section>
      )}
    </SiteLayout>
  );
};

export default Reserver;
