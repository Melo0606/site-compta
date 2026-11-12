const euros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

export function formatEuros(value: number): string {
  return euros.format(value);
}

export function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
}
