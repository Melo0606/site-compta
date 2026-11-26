import { getCategories } from "@/app/actions/categories";
import {
  pageHeadingClass,
  sectionHeadingClass,
  mutedClass,
  tableWrapClass,
  theadRowClass,
  thClass,
  emptyRowClass,
} from "@/lib/ui";
import { categoriesEnArbre } from "@/lib/categories";
import { CategorieRow } from "@/components/CategorieRow";
import { CategorieAjout } from "@/components/CategorieAjout";

export default async function CategoriesPage() {
  const categories = await getCategories();
  const arbre = categoriesEnArbre(categories);
  const racines = categories.filter((c) => c.parentId === null);
  const nbEnfants = (id: number) => categories.filter((c) => c.parentId === id).length;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className={pageHeadingClass}>Catégories</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Catégories et sous-catégories utilisées pour classer les dépenses et les revenus exceptionnels.
        </p>
      </div>

      {(["DEPENSE", "REVENU"] as const).map((type) => {
        const lignes = arbre.filter(({ categorie }) => categorie.type === type);
        return (
          <section key={type}>
            <h2 className={sectionHeadingClass}>
              {type === "DEPENSE" ? "Catégories de dépenses" : "Catégories de revenus"}
            </h2>
            <p className={`mt-1 text-sm ${mutedClass}`}>
              {type === "DEPENSE"
                ? "Pour les charges mensuelles, charges annuelles, achats prévus et dépenses du quotidien. Dans les statistiques, une sous-catégorie est comptée dans sa catégorie principale, et détaillée en cliquant sur celle-ci."
                : "Pour les revenus exceptionnels saisis sur la page d'un mois (ventes, cadeaux…)."}
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
                  {lignes.map(({ categorie }) => (
                    <CategorieRow
                      key={categorie.id}
                      categorie={categorie}
                      parentsPossibles={racines.filter((r) => r.id !== categorie.id && r.type === categorie.type)}
                      nbSousCategories={nbEnfants(categorie.id)}
                    />
                  ))}
                  {lignes.length === 0 && (
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
        );
      })}

      <section className="max-w-sm">
        <h2 className={sectionHeadingClass}>Ajouter une catégorie</h2>
        <CategorieAjout parentsPossibles={racines.map((r) => ({ id: r.id, nom: r.nom, type: r.type }))} />
      </section>
    </div>
  );
}
