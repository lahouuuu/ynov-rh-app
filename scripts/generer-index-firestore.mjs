/**
 * Génère firestore.indexes.json à partir des requêtes réellement faites par
 * l'API (listes filtrées + paginées, comptages des tableaux de bord…).
 * Usage : node scripts/generer-index-firestore.mjs
 */
import { writeFileSync } from 'node:fs';

const index = [];
const ajouter = (collectionGroup, champs) => {
  const fields = champs.map(([fieldPath, sens = 'ASCENDING']) =>
    sens === 'CONTAINS' ? { fieldPath, arrayConfig: 'CONTAINS' } : { fieldPath, order: sens },
  );
  if (fields.length < 2) return; // les index simple champ sont automatiques
  const cle = collectionGroup + JSON.stringify(fields);
  if (!index.some((i) => i.cle === cle)) index.push({ cle, collectionGroup, queryScope: 'COLLECTION', fields });
};
const sousEnsembles = (t) => t.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
const perimetres = [[], ['userId'], ['managerId'], ['campusId']];

// Listes paginées triées par date de début (décroissante)
for (const [col, filtres] of [
  ['demandes', ['statut', 'type', 'ficheStatut']],
  ['signalements', ['type', 'statutTraitement', 'qualification']],
]) {
  for (const p of perimetres) {
    for (const f of sousEnsembles(filtres)) {
      ajouter(col, [...p, ...f].map((c) => [c]).concat([['dateDebut', 'DESCENDING']]));
    }
    // Export CSV : plage de dates triée croissante
    ajouter(col, [...p.map((c) => [c]), ['dateDebut']]);
  }
}

// Demandes : chevauchements, en attente, tableaux de bord
ajouter('demandes', [['userId'], ['statut'], ['dateDebut']]);
ajouter('demandes', [['userId'], ['annee'], ['statut']]);
for (const p of ['userId', 'managerId', 'campusId']) ajouter('demandes', [[p], ['statut']]);
ajouter('demandes', [['campusId'], ['annulationDemandee']]);
ajouter('demandes', [['campusId'], ['ficheStatut']]);

// Signalements : tableaux de bord
for (const p of ['userId', 'managerId', 'campusId']) ajouter('signalements', [[p], ['statutTraitement']]);
ajouter('signalements', [['userId'], ['justificatifStatut']]);

// Justificatifs à examiner (périmètre RH)
ajouter('justificatifs', [['campusId'], ['statut']]);

// Historique d'un dossier, mouvements de solde, notifications
ajouter('historique', [['entite'], ['entiteId'], ['date']]);
ajouter('mouvements', [['userId'], ['annee'], ['date', 'DESCENDING']]);
ajouter('notifications', [['userId'], ['createdAt', 'DESCENDING']]);
ajouter('notifications', [['userId'], ['lu'], ['createdAt', 'DESCENDING']]);
ajouter('notifications', [['userId'], ['lu']]);

// Utilisateurs triés par nom (administration, droits annuels RH)
ajouter('users', [['nom'], ['prenom']]);
ajouter('users', [['campusId'], ['nom'], ['prenom']]);

const sortie = { indexes: index.map(({ cle, ...i }) => i), fieldOverrides: [] };
writeFileSync(new URL('../firestore.indexes.json', import.meta.url), JSON.stringify(sortie, null, 2) + '\n');
console.log(`${sortie.indexes.length} index composites générés.`);
