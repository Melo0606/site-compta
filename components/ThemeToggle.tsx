"use client";

import { useEffect, useState } from "react";

type ThemeChoice = "system" | "light" | "dark";

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  } else {
    root.setAttribute("data-theme", choice);
    localStorage.setItem("theme", choice);
  }
}

const ICONS: Record<ThemeChoice, React.ReactNode> = {
  system: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  ),
};

const LABELS: Record<ThemeChoice, string> = {
  system: "Système",
  light: "Clair",
  dark: "Sombre",
};

const NEXT: Record<ThemeChoice, ThemeChoice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    // localStorage n'existe pas côté serveur : on ne peut lire le choix
    // persisté qu'après le montage, d'où le setState synchrone ici.
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChoice(stored);
    }
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = NEXT[choice];
        setChoice(next);
        applyTheme(next);
      }}
      title="Changer le thème clair / sombre / système"
      className="flex w-full items-center gap-2 rounded-lg border border-shell-border px-3 py-2 text-xs font-medium text-shell-muted transition-colors hover:bg-shell-active hover:text-shell-text"
    >
      {ICONS[choice]}
      <span>Thème : {LABELS[choice]}</span>
    </button>
  );
}
