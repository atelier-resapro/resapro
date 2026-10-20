import { useCreneauxLibres } from "@/hooks/useCreneauxLibres";
import { formatHeure, toHeure } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface SlotPickerProps {
  date: string;
  prestationId: string;
  /** null = "Indifférent": the free starts of all the employees. */
  employeId: string | null;
  /** Selected start, as returned by the server (timestamptz). */
  value: string | null;
  onChange: (debut: string) => void;
}

const SlotPicker = ({ date, prestationId, employeId, value, onChange }: SlotPickerProps) => {
  const { data: debuts, isLoading, error } = useCreneauxLibres(date, prestationId, employeId);

  if (isLoading) return <p className="text-muted-foreground">Chargement des créneaux…</p>;
  if (error)
    return (
      <p role="alert" className="text-destructive">
        Impossible de charger les créneaux. Réessayez dans un instant.
      </p>
    );
  if (!debuts || debuts.length === 0)
    return (
      <p className="text-muted-foreground">
        Aucun horaire libre ce jour-là. Essayez un autre jour{employeId ? " ou un autre coiffeur" : ""}.
      </p>
    );

  return (
    <ul aria-label="Horaires libres" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {debuts.map((debut) => {
        const selected = debut === value;
        return (
          <li key={debut}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(debut)}
              className={cn(
                "h-11 w-full rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
              )}
            >
              {formatHeure(toHeure(new Date(debut)))}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default SlotPicker;
