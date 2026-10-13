/**
 * Exports CSV réservés aux gestionnaires RH, limités à leur périmètre.
 */
import { Router } from 'express';
import { z } from 'zod';
import { acteur, exigerRole } from '../middleware/authentification';
import { COL, db } from '../infra/firebase';
import { versCsv } from '../domain/csv';
import { LIBELLES_STATUT } from '../domain/workflow';
import { StatutDemande } from '../domain/types';
import { appliquerPerimetre } from '../services/listes';
import { journaliser } from '../services/journal';
import { date } from './schemas';

export const routesExport = Router();
routesExport.use(exigerRole('rh'));

const periode = z.object({ du: date, au: date });
const MAX = 5000;

function envoyerCsv(res: import('express').Response, nom: string, contenu: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(contenu);
}

async function tracer(u: ReturnType<typeof acteur>, quoi: string, du: string, au: string, n: number) {
  const batch = db().batch();
  journaliser(batch, u, { entite: 'parametres', entiteId: 'export', action: 'export_csv', resume: `Export ${quoi} du ${du} au ${au} (${n} ligne(s)).` });
  await batch.commit();
}

routesExport.get('/demandes.csv', async (req, res) => {
  const u = acteur(req);
  const q = periode.parse(req.query);
  const base = appliquerPerimetre(db().collection(COL.demandes), u, 'rh');
  const docs = base ? (await base.where('dateDebut', '>=', q.du).where('dateDebut', '<=', q.au).orderBy('dateDebut').limit(MAX).get()).docs : [];
  const lignes = docs.map((d) => {
    const x = d.data();
    return [
      x.userNom, x.campusId, x.serviceId, x.type === 'conge_paye' ? 'Congé payé' : 'Congé sans solde',
      x.dateDebut, x.dateFin, String(x.dureeTotale).replace('.', ','), String(x.joursPayes).replace('.', ','),
      String(x.joursNonPayes).replace('.', ','), LIBELLES_STATUT[x.statut as StatutDemande] ?? x.statut,
      x.avis ? (x.avis.favorable ? 'Favorable' : 'Défavorable') : '', x.decision?.auteurNom ?? '',
    ];
  });
  await tracer(u, 'des congés', q.du, q.au, lignes.length);
  envoyerCsv(
    res,
    `conges_${q.du}_${q.au}.csv`,
    versCsv(['Collaborateur', 'Campus', 'Service', 'Type', 'Début', 'Fin', 'Durée (j)', 'Payés (j)', 'Non payés (j)', 'Statut', 'Avis responsable', 'Décideur RH'], lignes),
  );
});

routesExport.get('/signalements.csv', async (req, res) => {
  const u = acteur(req);
  const q = periode.parse(req.query);
  const base = appliquerPerimetre(db().collection(COL.signalements), u, 'rh');
  const docs = base ? (await base.where('dateDebut', '>=', q.du).where('dateDebut', '<=', q.au).orderBy('dateDebut').limit(MAX).get()).docs : [];
  const lignes = docs.map((d) => {
    const x = d.data();
    return [
      x.userNom, x.campusId, x.serviceId, x.type === 'absence' ? 'Absence' : 'Retard', x.categorieLibelle,
      x.dateDebut, x.dateFin ?? '', x.retard?.minutes ?? '', x.statutTraitement, x.qualification, x.justificatifStatut,
      x.aPosteriori ? 'Oui' : 'Non',
    ];
  });
  await tracer(u, 'des signalements', q.du, q.au, lignes.length);
  envoyerCsv(
    res,
    `signalements_${q.du}_${q.au}.csv`,
    versCsv(['Collaborateur', 'Campus', 'Service', 'Type', 'Motif', 'Début', 'Fin', 'Retard (min)', 'Traitement', 'Qualification', 'Justificatif', 'A posteriori'], lignes),
  );
});
