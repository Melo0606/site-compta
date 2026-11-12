import { MOIS_LABELS_COURTS } from "@/lib/dates";
import { inputClass } from "@/lib/ui";

/**
 * Sélecteur Depuis/Jusqu'à en français (deux `<select>` natifs — mois et
 * année) plutôt qu'un `<input type="month">` : le calendrier natif suit la
 * langue du navigateur, pas celle de la page, donc rien ne garantit qu'il
 * s'affiche en français. Soumet deux champs `${name}Mois` (0-11) et
 * `${name}Annee` — à lire avec `parseMoisAbs` (voir `@/lib/dates`).
 */
export function SelecteurMois({ name, abs, anneeCourante }: { name: string; abs: number; anneeCourante: number }) {
  const annee = Math.floor(abs / 12);
  const mois0 = abs % 12;
  const annees = Array.from({ length: 7 }, (_, i) => anneeCourante - 1 + i);
  return (
    <span className="inline-flex items-center gap-1">
      <select name={`${name}Mois`} defaultValue={mois0} className={`${inputClass} w-auto`}>
        {MOIS_LABELS_COURTS.map((label, i) => (
          <option key={i} value={i}>
            {label}
          </option>
        ))}
      </select>
      <select name={`${name}Annee`} defaultValue={annee} className={`${inputClass} w-auto`}>
        {annees.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
    </span>
  );
}
