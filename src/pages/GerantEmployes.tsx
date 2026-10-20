import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useEmployesGerant } from "@/hooks/useEmployesGerant";
import { cn } from "@/lib/utils";

/** Message returned by the Edge Function ({ error: "..." }), or a generic one. */
async function messageErreur(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      // not JSON: generic message below
    }
  }
  return "L'invitation n'a pas pu être envoyée.";
}

const GerantEmployes = () => {
  const queryClient = useQueryClient();
  const { data: employes, isLoading, error } = useEmployesGerant();
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [erreurs, setErreurs] = useState<Record<string, string | null>>({});

  // The invitation is sent by the server (inviter-employe): no service key in the browser.
  const inviter = useMutation({
    mutationFn: async ({ employeId, email }: { employeId: string; email: string }) => {
      const { error } = await supabase.functions.invoke("inviter-employe", {
        body: { employe_id: employeId, email },
      });
      if (error) throw new Error(await messageErreur(error));
      return employeId;
    },
    onSuccess: (employeId) => {
      toast.success("Invitation envoyée. L'employé va recevoir un e-mail.");
      setEmails((e) => ({ ...e, [employeId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["gerant"] });
    },
    onError: (e: Error, { employeId }) => setErreurs((er) => ({ ...er, [employeId]: e.message })),
  });

  const handleSubmit = (employeId: string) => (e: FormEvent) => {
    e.preventDefault();
    setErreurs((er) => ({ ...er, [employeId]: null }));
    const email = (emails[employeId] ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErreurs((er) => ({ ...er, [employeId]: "Indiquez une adresse e-mail valide." }));
      return;
    }
    inviter.mutate({ employeId, email });
  };

  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">Employés</h1>
      <p className="mb-6 text-muted-foreground">
        Invitez un employé par e-mail : il choisit son mot de passe, puis il voit son agenda.
      </p>

      {isLoading && <p className="text-muted-foreground">Chargement…</p>}
      {error && (
        <p role="alert" className="text-destructive">
          Impossible de charger les employés.
        </p>
      )}

      <ul className="space-y-2">
        {employes?.map((emp) => (
          <li key={emp.id}>
            <Card className={cn(!emp.actif && "bg-muted")}>
              <CardContent className="space-y-3 p-4 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {emp.nom}
                    {emp.est_gerant && <span className="ml-2 text-sm font-normal text-muted-foreground">(gérant)</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {!emp.actif ? "Inactif" : emp.user_id ? "Compte actif" : "Pas de compte"}
                  </p>
                </div>
                {emp.actif && !emp.user_id && (
                  <form onSubmit={handleSubmit(emp.id)} noValidate className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1 basis-56 space-y-2">
                      <Label htmlFor={`email-${emp.id}`}>E-mail de {emp.nom}</Label>
                      <Input
                        id={`email-${emp.id}`}
                        type="email"
                        autoComplete="off"
                        value={emails[emp.id] ?? ""}
                        onChange={(e) => setEmails((em) => ({ ...em, [emp.id]: e.target.value }))}
                      />
                    </div>
                    <Button type="submit" disabled={inviter.isPending}>
                      Inviter
                    </Button>
                    {erreurs[emp.id] && (
                      <p role="alert" className="basis-full text-sm text-destructive">
                        {erreurs[emp.id]}
                      </p>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default GerantEmployes;
