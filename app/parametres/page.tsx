import { getParametres, updateParametres } from "@/app/actions/parametres";
import {
  inputClass,
  labelClass,
  buttonClass,
  pageHeadingClass,
  sectionHeadingClass,
  mutedClass,
  helpTextClass,
  checkboxLabelClass,
  radioClass,
} from "@/lib/ui";

export default async function ParametresPage() {
  const parametres = await getParametres();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Paramètres</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>Réglages généraux du budget du foyer.</p>
      </div>

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Paramètres</h2>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Clé de répartition utilisée pour calculer le virement dû par chaque personne sur le compte
          commun.
        </p>
        <form action={updateParametres} className="mt-4 flex flex-col gap-3">
          <fieldset className="flex flex-col gap-2">
            <legend className={labelClass}>Clé de répartition</legend>
            <label className={checkboxLabelClass}>
              <input
                type="radio"
                className={radioClass}
                name="cleRepartition"
                value="EGALE"
                defaultChecked={parametres.cleRepartition === "EGALE"}
              />
              50 / 50 (parts égales)
            </label>
            <label className={checkboxLabelClass}>
              <input
                type="radio"
                className={radioClass}
                name="cleRepartition"
                value="PRORATA_REVENUS"
                defaultChecked={parametres.cleRepartition === "PRORATA_REVENUS"}
              />
              Prorata des revenus
            </label>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="soldeCommun">
              Solde actuel du compte commun (€)
            </label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              id="soldeCommun"
              name="soldeCommun"
              defaultValue={parametres.soldeCommun}
            />
            <p className={helpTextClass}>
              À mettre à jour ponctuellement (ex : relevé bancaire). Le suivi mois par mois (charges
              payées, virements transférés) se fait directement depuis la page de chaque mois,
              accessible depuis le tableau de bord.
            </p>
          </div>
          <button type="submit" className={`${buttonClass} self-start`}>
            Enregistrer
          </button>
        </form>
      </section>
    </div>
  );
}
