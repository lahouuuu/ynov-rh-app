import { Router } from 'express';
import { z } from 'zod';
import { acteur } from '../middleware/authentification';
import { COL } from '../infra/firebase';
import * as svc from '../services/signalements';
import { listerPagine } from '../services/listes';
import { listerPourDossier } from '../services/justificatifs';
import { historiqueVisible } from '../services/historique';
import { cle, date, heure, liste, pagination, texte } from './schemas';

export const routesSignalements = Router();

routesSignalements.post('/', async (req, res) => {
  const b = z
    .object({
      type: z.enum(['absence', 'retard']),
      categorie: z.string().min(1).max(50),
      dateDebut: date,
      dateFin: date.nullable().optional(),
      dureeEstimee: texte(100).optional(),
      commentaire: texte(1000).optional(),
      heurePrevue: heure.optional(),
      heureArriveeEstimee: heure.nullable().optional(),
      heureArriveeReelle: heure.nullable().optional(),
      cleIdempotence: cle,
    })
    .parse(req.body);
  const r = await svc.declarer(acteur(req), b);
  res.status(r.doublon ? 200 : 201).json(r);
});

routesSignalements.get('/', async (req, res) => {
  const u = acteur(req);
  const q = pagination
    .extend({
      vue: z.enum(['moi', 'equipe', 'rh']).default('moi'),
      type: z.enum(['absence', 'retard']).optional(),
      statutTraitement: liste(['declare', 'en_cours', 'cloture']),
      qualification: z.enum(['a_examiner', 'justifie', 'non_justifie']).optional(),
    })
    .parse(req.query);
  const r = await listerPagine(
    COL.signalements,
    u,
    { ...q, egalites: { type: q.type, statutTraitement: q.statutTraitement, qualification: q.qualification } },
    svc.versSignalement,
  );
  res.json({ ...r, elements: r.elements.map((s) => svc.vueSignalement(u, s)) });
});

routesSignalements.get('/:id', async (req, res) => {
  const u = acteur(req);
  const s = await svc.chargerSignalement(u, req.params.id);
  const [justificatifs, historique] = await Promise.all([
    listerPourDossier(u, s.id),
    historiqueVisible(u, 'signalement', s.id, s),
  ]);
  res.json({ signalement: svc.vueSignalement(u, s), actions: svc.actionsSignalement(u, s), justificatifs, historique });
});

routesSignalements.patch('/:id', async (req, res) => {
  const b = z
    .object({
      dateFin: date.nullable().optional(),
      dureeEstimee: texte(100).optional(),
      commentaire: texte(1000).optional(),
      heureArriveeEstimee: heure.nullable().optional(),
      heureArriveeReelle: heure.nullable().optional(),
      motif: texte(1000).optional(),
    })
    .parse(req.body);
  await svc.completer(acteur(req), req.params.id, b);
  res.json({ ok: true });
});

routesSignalements.post('/:id/prise-connaissance', async (req, res) => {
  await svc.prendreConnaissance(acteur(req), req.params.id);
  res.json({ ok: true });
});

routesSignalements.post('/:id/traitement', async (req, res) => {
  const b = z
    .object({
      qualification: z.enum(['a_examiner', 'justifie', 'non_justifie']).optional(),
      statutTraitement: z.enum(['declare', 'en_cours', 'cloture']).optional(),
      motif: texte(1000).optional(),
      demanderJustificatif: z.object({ echeance: date }).nullable().optional(),
      imputerConges: z.boolean().optional(),
    })
    .parse(req.body);
  await svc.traiter(acteur(req), req.params.id, b);
  res.json({ ok: true });
});
