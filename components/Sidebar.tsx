"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { countBadgeClass } from "@/lib/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

const NAV_LINKS = [
  { href: "/", label: "Tableau de bord" },
  { href: "/personnes", label: "Personnes" },
  { href: "/revenus", label: "Revenus" },
  { href: "/charges-mensuelles", label: "Charges mensuelles" },
  { href: "/charges-annuelles", label: "Charges annuelles" },
  { href: "/achats-prevus", label: "Achats prévus" },
  { href: "/categories", label: "Catégories" },
  { href: "/stats", label: "Stats" },
  { href: "/parametres", label: "Paramètres" },
];

export function Sidebar({ budgetsNonConfigures }: { budgetsNonConfigures: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <div className="flex items-center justify-between border-b border-shell-border bg-shell px-4 py-3 text-shell-text md:hidden">
        <span className="text-sm font-semibold">Ma comptabilité</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-1.5 text-shell-muted hover:bg-shell-active hover:text-shell-text"
          aria-label="Ouvrir le menu"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-5 overflow-y-auto bg-shell px-4 py-5 text-shell-text transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-flag text-sm font-bold text-white">
            MC
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Ma comptabilité</div>
            <div className="text-xs text-shell-muted">Budget du foyer</div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-shell-active font-semibold text-shell-text"
                    : "font-medium text-shell-muted hover:bg-shell-active/60 hover:text-shell-text"
                }`}
              >
                <span>{link.label}</span>
                {link.href === "/charges-mensuelles" && budgetsNonConfigures > 0 && (
                  <span
                    className={countBadgeClass}
                    title={`${budgetsNonConfigures} budget${budgetsNonConfigures > 1 ? "s" : ""} « Dépenses du quotidien » à 0 € — montant de référence pas encore fixé`}
                  >
                    {budgetsNonConfigures}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>
    </>
  );
}
