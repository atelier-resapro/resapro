import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { formatDuree, formatPrix } from "@/lib/format";
import { cn } from "@/lib/utils";

type Prestation = Tables<"prestations">;

const GerantPrestations = () => {
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState<Prestation | null>(null);
  const [nom, setNom] = useState("");
  const [duree, setDuree] = useState("");
  const [prix, setPrix] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  // The manager sees every service, active or not.
  const { data: prestations, isLoading, error } = useQuery({
    queryKey: ["prestations", "toutes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prestations").select("*").order("nom");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["prestations"] });

  const enregistrer = useMutation({
    mutationFn: async (values: { nom: string; duree_minutes: number; prix: number }) => {
      if (edition) {
        const { error } = await supabase.from("prestations").update(values).eq("id", edition.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("prestations").insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(edition ? "Prestation modifiée" : "Prestation ajoutée");
      reinitialiser();
      refresh();
    },
    onError: (e: Error) => setErreur(e.message),
  });

  // A service is never deleted: it is deactivated (appointments keep pointing to it).
  const basculer = useMutation({
    mutationFn: async (p: Prestation) => {
      const { error } = await supabase.from("prestations").update({ active: !p.active }).eq("id", p.id);
      if (error) throw error;
      return !p.active;
    },
    onSuccess: (active) => {
      toast.success(active ? "Prestation réactivée" : "Prestation désactivée");
      refresh();
    },
    onError: () => toast.error("Impossible de modifier la prestation."),
  });

  function reinitialiser() {
    setEdition(null);
    setNom("");
    setDuree("");
    setPrix("");
    setErreur(null);
  }

  function commencerEdition(p: Prestation) {
    setEdition(p);
    setNom(p.nom);
    setDuree(String(p.duree_minutes));
    setPrix(String(p.prix).replace(".", ","));
    setErreur(null);
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErreur(null);
    const dureeNum = Number(duree);
    const prixNum = Number(prix.replace(",", "."));
    if (nom.trim().length < 2) return setErreur("Indiquez le nom de la prestation.");
    if (!Number.isInteger(dureeNum) || dureeNum <= 0) return setErreur("La durée doit être un nombre de minutes positif.");
    if (!Number.isFinite(prixNum) || prixNum < 0) return setErreur("Le prix doit être un nombre positif ou nul.");
    enregistrer.mutate({ nom: nom.trim(), duree_minutes: dureeNum, prix: Math.round(prixNum * 100) / 100 });
  };

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Prestations</h1>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>{edition ? `Modifier « ${edition.nom} »` : "Ajouter une prestation"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prestation-nom">Nom</Label>
              <Input id="prestation-nom" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prestation-duree">Durée (minutes)</Label>
                <Input
                  id="prestation-duree"
                  inputMode="numeric"
                  value={duree}
                  onChange={(e) => setDuree(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prestation-prix">Prix (€)</Label>
                <Input id="prestation-prix" inputMode="decimal" value={prix} onChange={(e) => setPrix(e.target.value)} />
              </div>
            </div>
            {erreur && (
              <p role="alert" className="text-sm text-destructive">
                {erreur}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={enregistrer.isPending}>
                {edition ? "Enregistrer" : "Ajouter"}
              </Button>
              {edition && (
                <Button type="button" variant="outline" onClick={reinitialiser}>
                  Annuler
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading && <p className="text-muted-foreground">Chargement…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          Impossible de charger les prestations.
        </p>
      )}
      <ul className="space-y-2">
        {prestations?.map((p) => (
          <li key={p.id}>
            <Card className={cn(!p.active && "bg-muted")}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-4">
                <div>
                  <p className="font-semibold">
                    {p.nom}
                    {!p.active && <span className="ml-2 text-sm font-normal text-muted-foreground">(désactivée)</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDuree(p.duree_minutes)} · {formatPrix(p.prix)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => commencerEdition(p)}>
                    Modifier
                  </Button>
                  <Button size="sm" variant="secondary" disabled={basculer.isPending} onClick={() => basculer.mutate(p)}>
                    {p.active ? "Désactiver" : "Réactiver"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default GerantPrestations;
