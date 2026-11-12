import { getCategories, createCategorie } from "@/app/actions/categories";
import {
  inputClass,
  labelClass,
  buttonClass,
  pageHeadingClass,
  sectionHeadingClass,
  mutedClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  emptyRowClass,
} from "@/lib/ui";
import { CategorieRow } from "@/components/CategorieRow";

export default async function CategoriesPage() {
  const categories = await getCategories();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Catégories</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Liste des catégories utilisées pour classer les charges et les dépenses.
        </p>
      </div>

      <section>
        <h2 className={sectionHeadingClass}>Catégories</h2>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Liste partagée par les charges mensuelles, charges annuelles, achats prévus et dépenses du
          quotidien — utilisée dans les statistiques par catégorie.
        </p>
        <div className={`mt-3 ${tableWrapClass}`}>
          <table className="w-full min-w-[420px] text-sm">
            <thead className={theadRowClass}>
              <tr>
                <th className={thClass}>Nom</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((categorie) => (
                <CategorieRow key={categorie.id} categorie={categorie} />
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={2} className={emptyRowClass}>
                    Aucune catégorie pour le moment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Ajouter une catégorie</h2>
        <form action={createCategorie} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass} htmlFor="nom">
              Nom
            </label>
            <input className={inputClass} type="text" id="nom" name="nom" required />
          </div>
          <button type="submit" className={`${buttonClass} self-start`}>
            Ajouter
          </button>
        </form>
      </section>
    </div>
  );
}
