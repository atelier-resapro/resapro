/** Local date -> "YYYY-MM-DD" (never toISOString: it shifts the day with the time zone). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" -> local Date at midnight */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** The salon is open Tuesday to Saturday. */
export function estJourOuvrable(d: Date): boolean {
  const dow = d.getDay(); // 0 = Sunday
  return dow >= 2 && dow <= 6;
}

/** The next open days, starting today. */
export function prochainsJoursOuvrables(count: number, from: Date = new Date()): string[] {
  const jours: string[] = [];
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  while (jours.length < count) {
    if (estJourOuvrable(d)) jours.push(toISODate(d));
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

/** "2026-10-21" -> "mercredi 21 octobre" */
export function formatJour(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(fromISODate(iso));
}

/** "2026-10-21" -> { semaine: "mer.", numero: "21", mois: "oct." } (labels of the day picker) */
export function formatJourCourt(iso: string): { semaine: string; numero: string; mois: string } {
  const d = fromISODate(iso);
  return {
    semaine: new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(d),
    numero: String(d.getDate()),
    mois: new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(d),
  };
}

/** Local time of a Date -> "HH:MM" (to pass to formatHeure) */
export function toHeure(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "2026-10-21", 2 -> "2026-10-23" */
export function ajouterJours(iso: string, jours: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + jours);
  return toISODate(d);
}

const formatSalon = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Timestamptz from the database -> salon day and time (Europe/Paris), whatever the browser's time zone. */
export function jourEtHeureSalon(instant: string): { date: string; heure: string } {
  const parts = formatSalon.formatToParts(new Date(instant));
  const p = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${p("year")}-${p("month")}-${p("day")}`, heure: `${p("hour")}:${p("minute")}` };
}

/** 1 (Monday, like isodow) -> "lundi" */
export function nomJourSemaine(jour: number): string {
  return ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"][jour - 1] ?? "";
}

/** "09:00:00" -> "9 h 00" */
export function formatHeure(time: string): string {
  const [h, m] = time.split(":");
  return `${Number(h)} h ${m}`;
}
