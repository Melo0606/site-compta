// Primitives partagées pour les className Tailwind. Toutes les couleurs
// passent par les tokens définis dans app/globals.css (--color-*) afin de
// suivre automatiquement le thème clair/sombre.

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-muted-2 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent-soft";

export const selectClass = inputClass;

export const labelClass = "text-sm font-medium text-text";

export const helpTextClass = "text-xs text-muted";

export const checkboxLabelClass = "flex items-center gap-2 text-sm text-text";

export const checkboxClass = "h-4 w-4 cursor-pointer rounded border-border accent-accent";

export const radioClass = "h-4 w-4 cursor-pointer border-border accent-accent";

export const buttonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-accent-soft disabled:opacity-50";

export const buttonSecondaryClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-muted focus:outline-none focus:ring-2 focus:ring-accent-soft";

export const buttonSecondarySmallClass =
  "inline-flex items-center justify-center rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-text";

export const buttonDangerClass =
  "inline-flex items-center justify-center rounded-lg border border-neg/25 px-3 py-1.5 text-xs font-medium text-neg transition-colors hover:bg-neg-soft";

export const buttonDangerSmallClass =
  "inline-flex items-center justify-center rounded-md border border-neg/25 px-2 py-1 text-xs font-medium text-neg transition-colors hover:bg-neg-soft";

export const buttonPositiveSmallClass =
  "inline-flex items-center justify-center rounded-md border border-pos/30 px-2 py-1 text-xs font-medium text-pos transition-colors hover:bg-pos-soft";

export const linkClass = "text-accent underline-offset-2 hover:underline";

export const linkMutedClass = "text-muted underline-offset-2 hover:text-text hover:underline";

export const cardClass = "rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]";

export const cardPadClass = `${cardClass} p-4`;

export const pageHeadingClass = "text-xl font-semibold tracking-tight text-text";

export const sectionHeadingClass = "text-base font-semibold text-text";

export const subHeadingClass = "text-sm font-semibold text-text";

export const mutedClass = "text-muted";

// ---- Tableaux ----

export const tableWrapClass = `${cardClass} overflow-x-auto`;

export const theadRowClass = "bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted";

export const thClass = "px-4 py-2.5 font-semibold whitespace-nowrap";

export const tdClass = "px-4 py-2.5 text-text";

export const tdMutedClass = "px-4 py-2.5 text-muted";

export const rowClass = "border-t border-border transition-colors hover:bg-surface-muted/60";

export const footRowClass = "border-t border-border bg-surface-muted font-semibold text-text";

export const emptyRowClass = "px-4 py-6 text-center text-muted-2";

// ---- Badges / pastilles ----

export type PillVariant = "accent" | "warn" | "flag" | "pos" | "neg" | "neutral";

const pillVariants: Record<PillVariant, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn-soft text-warn",
  flag: "bg-flag-soft text-flag",
  pos: "bg-pos-soft text-pos",
  neg: "bg-neg-soft text-neg",
  neutral: "bg-surface-muted text-muted",
};

export function pillClass(variant: PillVariant = "neutral"): string {
  return `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pillVariants[variant]}`;
}

export function amountClass(value: number): string {
  return value < 0 ? "font-medium text-neg" : "font-medium text-pos";
}

export const countBadgeClass =
  "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-warn px-1 text-[10px] font-semibold text-white";

// ---- Contrôle segmenté (bascules de vue : 12/24 mois, Tableau/Camembert…) ----

export const segmentedWrapClass = "inline-flex items-center gap-1 rounded-lg border border-border bg-surface p-1";

export function segmentedItemClass(active: boolean): string {
  return active
    ? "rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-on-accent"
    : "rounded-md px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:text-text";
}
