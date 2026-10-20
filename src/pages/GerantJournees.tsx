import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ConfirmButton from "@/components/ConfirmButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatJour, toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Journee {
  date: string;
  total: number;
  ouverts: number;
  confirmes: number;
}

const GerantJournees = () => {
  const queryClient = useQueryClient();
  const aujourdhui = useMemo(() => toISODate(new Date()), []);

  const { data: journees, isLoading, error } = useQuery({
    queryKey: ["gerant", "journees", aujourdhui],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("creneaux")
        .select("date, ouvert, rendez_vous(statut)")
        .gte("date", aujourdhui)
        .order("date")
        .limit(1000);
      if (error) throw error;

      const parDate = new Map<string, Journee>();
      for (const c of data) {
        const j = parDate.get(c.date) ?? { date: c.date, total: 0, ouverts: 0, confirmes: 0 };
        j.total += 1;
        if (c.ouvert) j.ouverts += 1;
        j.confirmes += c.rendez_vous.filter((r) => r.statut === "confirme").length;
        parDate.set(c.date, j);
      }
      return [...parDate.values()];
    },
  });

  // Closing a day = every slot of that day gets ouvert = false.
  const changer = useMutation({
    mutationFn: async ({ date, ouvert }: { date: string; ouvert: boolean }) => {
      const { error } = await supabase.from("creneaux").update({ ouvert }).eq("date", date);
      if (error) throw error;
      return ouvert;
    },
    onSuccess: (ouvert) => {
      toast.success(ouvert ? "Journée rouverte" : "Journée fermée");
      queryClient.invalidateQueries({ queryKey: ["gerant", "journees"] });
      queryClient.invalidateQueries({ queryKey: ["creneaux-libres"] });
    },
    onError: () => toast.error("Impossible de modifier la journée."),
  });

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Journées</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Une journée fermée ne propose plus aucun créneau aux clients. Les rendez-vous déjà pris ne sont pas annulés : pensez
        à les annuler depuis le planning.
      </p>

      {isLoading && <p className="text-muted-foreground">Chargement…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          Impossible de charger les journées.
        </p>
      )}

      <ul className="space-y-2">
        {journees?.map((j) => {
          const fermee = j.ouverts === 0;
          return (
            <li key={j.date}>
              <Card className={cn(fermee && "bg-muted")}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-4">
                  <div>
                    <p className="font-semibold capitalize">
                      {formatJour(j.date)}
                      {j.date === aujourdhui && <span className="ml-2 text-sm font-normal text-primary">aujourd'hui</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {fermee ? "Fermée" : `Ouverte, ${j.ouverts} créneaux`}
                      {j.confirmes > 0 && ` · ${j.confirmes} rendez-vous confirmé${j.confirmes > 1 ? "s" : ""}`}
                    </p>
                  </div>
                  {fermee ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={changer.isPending}
                      onClick={() => changer.mutate({ date: j.date, ouvert: true })}
                    >
                      Rouvrir la journée
                    </Button>
                  ) : (
                    <ConfirmButton
                      question={
                        j.confirmes > 0
                          ? `Fermer malgré ${j.confirmes} rendez-vous confirmé${j.confirmes > 1 ? "s" : ""} ?`
                          : "Fermer cette journée ?"
                      }
                      disabled={changer.isPending}
                      onConfirm={() => changer.mutate({ date: j.date, ouvert: false })}
                    >
                      Fermer la journée
                    </ConfirmButton>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default GerantJournees;
