import { useCreneauxLibres } from "@/hooks/useCreneauxLibres";
import { formatHeure } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface SlotPickerProps {
  date: string;
  value: string | null;
  onChange: (creneauId: string, heure: string) => void;
}

const SlotPicker = ({ date, value, onChange }: SlotPickerProps) => {
  const { data: creneaux, isLoading, error } = useCreneauxLibres(date);

  if (isLoading) return <p className="text-muted-foreground">Chargement des créneaux…</p>;
  if (error)
    return (
      <p role="alert" className="text-destructive">
        Impossible de charger les créneaux. Réessayez dans un instant.
      </p>
    );
  if (!creneaux || creneaux.length === 0)
    return <p className="text-muted-foreground">Aucun créneau libre ce jour-là. Essayez un autre jour.</p>;

  return (
    <ul aria-label="Créneaux libres" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {creneaux.map((c) => {
        const selected = c.creneau_id === value;
        return (
          <li key={c.creneau_id}>
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(c.creneau_id, c.heure_debut)}
              className={cn(
                "h-11 w-full rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
              )}
            >
              {formatHeure(c.heure_debut)}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export default SlotPicker;
