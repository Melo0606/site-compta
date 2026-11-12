import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autonome (serveur + node_modules minimaux) pour être embarqué dans
  // l'application de bureau Electron sans dépendre du dossier node_modules complet.
  output: "standalone",
};

export default nextConfig;
