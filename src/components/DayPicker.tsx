import { formatJourCourt } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface DayPickerProps {
  jours: string[];
  value: string | null;
  onChange: (iso: string) => void;
}

const DayPicker = ({ jours, value, onChange }: DayPickerProps) => (
  <div role="group" aria-label="Choisir un jour" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
    {jours.map((iso) => {
      const j = formatJourCourt(iso);
      const selected = iso === value;
      return (
        <button
          key={iso}
          type="button"
          aria-pressed={selected}
          onClick={() => onChange(iso)}
          className={cn(
            "flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            selected ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
          )}
        >
          <span className="capitalize">{j.semaine}</span>
          <span className="text-xl font-semibold">{j.numero}</span>
          <span>{j.mois}</span>
        </button>
      );
    })}
  </div>
);

export default DayPicker;
