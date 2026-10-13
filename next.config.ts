import type { NextConfig } from 'next';

/**
 * Export statique (dossier out/) servi par Firebase Hosting. Aucune Server
 * Action ni rendu serveur à la requête : les données privées sont chargées
 * après authentification depuis l'API (/api → Cloud Functions).
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
