/**
 * Variables d'environnement des tests d'intégration. Importé en premier par
 * outils.ts pour être appliqué avant le chargement de l'API.
 */
export const PROJET = process.env.GCLOUD_PROJECT || 'demo-ynov-rh';
process.env.GCLOUD_PROJECT = PROJET;
process.env.STORAGE_BUCKET = `${PROJET}.appspot.com`;
