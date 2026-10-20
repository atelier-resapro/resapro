const prixFormat = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

/** 35 -> "35,00 €" */
export function formatPrix(prix: number | string): string {
  return prixFormat.format(Number(prix));
}

/** 45 -> "45 min" */
export function formatDuree(minutes: number): string {
  return `${minutes} min`;
}
