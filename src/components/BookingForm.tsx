import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { normaliserTelephone } from "@/lib/phone";
import { envoyerSms } from "@/lib/sms";

interface BookingFormProps {
  prestationId: string;
  /** null = "Indifférent": the server picks the employee. */
  employeId: string | null;
  /** Start chosen in the list of free starts (timestamptz from the server). */
  debut: string;
  date: string;
  /** Called after the booking succeeded, with the new appointment id. */
  onBooked: (rendezVousId: string) => void;
}

const BookingForm = ({ prestationId, employeId, debut, date, onBooked }: BookingFormProps) => {
  const queryClient = useQueryClient();
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [erreurNom, setErreurNom] = useState<string | null>(null);
  const [erreurTel, setErreurTel] = useState<string | null>(null);
  const [erreurBase, setErreurBase] = useState<string | null>(null);

  const reserver = useMutation({
    mutationFn: async (values: { nom: string; telephone: string }) => {
      const { data, error } = await supabase.rpc("reserver_employe", {
        p_nom: values.nom,
        p_telephone: values.telephone,
        p_prestation_id: prestationId,
        p_employe_id: employeId,
        p_debut: debut,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (rendezVousId) => {
      queryClient.invalidateQueries({ queryKey: ["creneaux-libres", date] });
      toast.success("Rendez-vous réservé");
      // Confirmation SMS: sent in the background, a failure changes nothing for the client.
      void envoyerSms(rendezVousId, "confirmation");
      onBooked(rendezVousId);
    },
    onError: (error: Error) => {
      // The message comes from the database (for example: slot just taken).
      setErreurBase(error.message);
      queryClient.invalidateQueries({ queryKey: ["creneaux-libres", date] });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErreurBase(null);

    const nomPropre = nom.trim();
    const telNormalise = normaliserTelephone(telephone);
    const errNom = nomPropre.length < 2 ? "Merci d'indiquer votre nom." : null;
    const errTel = telNormalise ? null : "Numéro invalide. Exemple : 06 12 34 56 78.";
    setErreurNom(errNom);
    setErreurTel(errTel);
    if (errNom || errTel || !telNormalise) return;

    reserver.mutate({ nom: nomPropre, telephone: telNormalise });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nom">Votre nom</Label>
        <Input
          id="nom"
          name="nom"
          autoComplete="name"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          aria-invalid={!!erreurNom}
          aria-describedby={erreurNom ? "nom-erreur" : undefined}
        />
        {erreurNom && (
          <p id="nom-erreur" className="text-sm text-destructive">
            {erreurNom}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="telephone">Votre téléphone</Label>
        <Input
          id="telephone"
          name="telephone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="06 12 34 56 78"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          aria-invalid={!!erreurTel}
          aria-describedby={erreurTel ? "telephone-erreur" : undefined}
        />
        {erreurTel && (
          <p id="telephone-erreur" className="text-sm text-destructive">
            {erreurTel}
          </p>
        )}
      </div>

      {erreurBase && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erreurBase}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={reserver.isPending}>
        {reserver.isPending ? "Réservation en cours…" : "Réserver"}
      </Button>
    </form>
  );
};

export default BookingForm;
