"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function Tabs({
  tabs,
  defaultTabId,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  defaultTabId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeId, setActiveId] = useState(defaultTabId ?? tabs[0]?.id);

  // Répercute l'onglet actif dans l'URL (`?tab=...`) plutôt que de le garder
  // en simple state local : sans ça, les liens calculés côté serveur (ex :
  // mois précédent/suivant sur la page d'un mois) ne peuvent pas savoir quel
  // onglet est affiché et retombent sur le premier par défaut.
  const selectTab = (id: string) => {
    setActiveId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === tabs[0]?.id) {
      params.delete("tab");
    } else {
      params.set("tab", id);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeId === tab.id
                ? "border-accent text-text"
                : "border-transparent text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tabs.map((tab) => (
          <div key={tab.id} hidden={activeId !== tab.id}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
