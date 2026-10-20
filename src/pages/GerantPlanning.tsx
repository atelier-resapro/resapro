import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ConfirmButton from "@/components/ConfirmButton";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { envoyerSms } from "@/lib/sms";
import { useRendezVousGerant } from "@/hooks/useRendezVousGerant";
import { formatHeure, formatJour, toISODate } from "@/lib/dates";
import { formatTelephone } from "@/lib/phone";
import { cn } from "@/lib/utils";

type Periode = "jour" | "semaine";

const GerantPlanning = () => {
  const queryClient = useQueryClient();
  const [periode, setPeriode] = useState<Periode>("jour");

  const { aujourdhui, fin } = useMemo(() => {
    const now = new Date();
    const finSemaine = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6);
    return { aujourdhui: toISODate(now), fin: toISODate(finSemaine) };
  }, []);

  const { data: rendezVous, isLoading, error } = useRendezVousGerant(aujourdhui, periode === "jour" ? aujourdhui : fin);

  const annuler = useMutation({
    mutationFn: async (rendezVousId: string) => {
      const { error } = await supabase
        .from("rendez_vous")
        .update({ statut: "annule" })
        .eq("id", rendezVousId)
        .eq("statut", "confirme");
      if (error) throw error;
      return rendezVousId;
    },
    onSuccess: async (rendezVousId) => {
      queryClient.invalidateQueries({ queryKey: ["gerant"] });
      queryClient.invalidateQueries({ queryKey: ["creneaux-libres"] });
      // The cancellation is done; the SMS is a bonus that never blocks it.
      const envoye = await envoyerSms(rendezVousId, "annulation");
      if (envoye) toast.success("Rendez-vous annulé, le client a été prévenu par SMS");
      else toast.warning("Rendez-vous annulé, mais le SMS n'a pas pu être envoyé");
    },
    onError: () => toast.error("Impossible d'annuler ce rendez-vous."),
  });

  // Group by day
  const parJour = useMemo(() => {
    const groupes = new Map<string, NonNullable<typeof rendezVous>>();
    for (const rdv of rendezVous ?? []) {
      const liste = groupes.get(rdv.date) ?? [];
      liste.push(rdv);
      groupes.set(rdv.date, liste);
    }
    return [...groupes.entries()];
  }, [rendezVous]);

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Planning</h1>

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

      {isLoading && <p className="text-muted-foreground">Chargement du planning…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          Impossible de charger le planning.
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
                <li key={rdv.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-4">
                      <p className="w-16 shrink-0 text-lg font-semibold text-primary">
                        {formatHeure(rdv.heure)}
                      </p>
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="font-medium">
                          {rdv.prestations?.nom}
                          {rdv.employes && <span className="font-normal text-muted-foreground"> · avec {rdv.employes.nom}</span>}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {rdv.clients?.nom} ·{" "}
                          <a href={`tel:${rdv.clients?.telephone}`} className="underline underline-offset-2">
                            {rdv.clients ? formatTelephone(rdv.clients.telephone) : ""}
                          </a>
                        </p>
                      </div>
                      <ConfirmButton
                        question="Annuler ce rendez-vous ?"
                        disabled={annuler.isPending}
                        onConfirm={() => annuler.mutate(rdv.id)}
                      >
                        Annuler
                      </ConfirmButton>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
};

export default GerantPlanning;
