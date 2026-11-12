import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { compterBudgetsQuotidiensNonConfigures } from "@/app/actions/charges-mensuelles";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ma comptabilité",
  description: "Comptabilité personnelle locale",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#121218" },
  ],
};

// Toutes les pages lisent la base de données à chaque requête : sans ceci,
// Next.js peut les pré-rendre en HTML statique au moment du build et figer
// dedans les données de la base utilisée à ce moment-là (ex. build fait sur
// la base de dev) — ce HTML serait alors livré tel quel dans le bundle
// packagé, pour toute base ouverte par tout utilisateur de l'app de bureau.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const budgetsNonConfigures = await compterBudgetsQuotidiensNonConfigures();

  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-bg text-text md:flex-row" suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}`}
        </Script>
        <Sidebar budgetsNonConfigures={budgetsNonConfigures} />
        <main className="w-full min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-[1800px]">{children}</div>
        </main>
      </body>
    </html>
  );
}
