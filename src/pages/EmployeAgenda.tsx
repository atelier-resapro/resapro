import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useMesHoraires } from "@/hooks/useMesHoraires";
import { useMonAgenda } from "@/hooks/useMonAgenda";
import { formatHeure, formatJour, nomJourSemaine, toHeure, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Periode = "jour" | "semaine";

/** Agenda of the signed-in employee: read only, client name only. */
const EmployeAgenda = () => {
  const [periode, setPeriode] = useState<Periode>("jour");

  const { aujourdhui, fin } = useMemo(() => {
    const now = new Date();
    const finSemaine = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6);
    return { aujourdhui: toISODate(now), fin: toISODate(finSemaine) };
  }, []);

  const { data: rendezVous, isLoading, error } = useMonAgenda(aujourdhui, periode === "jour" ? aujourdhui : fin);
  const horaires = useMesHoraires();

  // Group by day
  const parJour = useMemo(() => {
    const groupes = new Map<string, NonNullable<typeof rendezVous>>();
    for (const rdv of rendezVous ?? []) {
      const jour = toISODate(new Date(rdv.debut));
      const liste = groupes.get(jour) ?? [];
      liste.push(rdv);
      groupes.set(jour, liste);
    }
    return [...groupes.entries()];
  }, [rendezVous]);

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Mon agenda</h1>

      <div role="group" aria-label="Période" className="mb-6 inline-flex rounded-lg border bg-card p-1">
        {(
          [
            ["jour", "Aujourd'hui"],
            ["semaine", "7 prochains jours"],
          ] as const
        ).map(([valeur, label]) => (
          <button
            key={valeur}
            type="button"
            aria-pressed={periode === valeur}
            onClick={() => setPeriode(valeur)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              periode === valeur ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground">Chargement de l'agenda…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          Impossible de charger l'agenda.
        </p>
      )}
      {rendezVous && rendezVous.length === 0 && (
        <p className="text-muted-foreground">
          {periode === "jour" ? "Aucun rendez-vous aujourd'hui." : "Aucun rendez-vous dans les 7 prochains jours."}
        </p>
      )}

      <div className="space-y-6">
        {parJour.map(([jour, liste]) => (
          <section key={jour} aria-labelledby={`jour-${jour}`}>
            <h2 id={`jour-${jour}`} className="mb-2 text-lg font-semibold capitalize">
              {jour === aujourdhui ? `Aujourd'hui, ${formatJour(jour)}` : formatJour(jour)}
            </h2>
            <ul className="space-y-2">
              {liste.map((rdv) => (
                <li key={rdv.rendez_vous_id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-4">
                      <p className="w-28 shrink-0 font-semibold text-primary">
                        {formatHeure(toHeure(new Date(rdv.debut)))} – {formatHeure(toHeure(new Date(rdv.fin)))}
                      </p>
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="font-medium">{rdv.prestation}</p>
                        <p className="truncate text-sm text-muted-foreground">{rdv.client_nom}</p>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="mes-horaires" className="mt-10">
        <h2 id="mes-horaires" className="mb-2 text-lg font-semibold">
          Mes horaires
        </h2>
        {horaires.error && (
          <p role="alert" className="text-destructive">
            Impossible de charger les horaires.
          </p>
        )}
        {horaires.data && horaires.data.length === 0 && (
          <p className="text-muted-foreground">Aucun horaire enregistré. Voyez avec le gérant.</p>
        )}
        {horaires.data && horaires.data.length > 0 && (
          <Card>
            <CardContent className="p-4 sm:p-4">
              <ul className="space-y-1">
                {horaires.data.map((h) => (
                  <li key={h.id} className="flex justify-between gap-4">
                    <span className="capitalize">{nomJourSemaine(h.jour_semaine)}</span>
                    <span>
                      {formatHeure(h.heure_debut)} – {formatHeure(h.heure_fin)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </section>
  );
};

export default EmployeAgenda;
