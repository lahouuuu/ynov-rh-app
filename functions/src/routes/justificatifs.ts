import { Router } from 'express';
import { z } from 'zod';
import { acteur } from '../middleware/authentification';
import * as svc from '../services/justificatifs';
import { texte } from './schemas';

export const routesJustificatifs = Router();

/**
 * Dépôt d'un justificatif. Le fichier est transmis encodé en base64 dans un
 * corps JSON (limite du corps : 15 Mo, soit ~10 Mo de fichier).
 */
routesJustificatifs.post('/', async (req, res) => {
  const b = z
    .object({
      dossierType: z.enum(['demande', 'signalement']),
      dossierId: z.string().min(1).max(100),
      nomFichier: z.string().min(1).max(200),
      contentType: z.string().max(100),
      contenuBase64: z.string().min(1),
    })
    .parse(req.body);
  res.status(201).json(await svc.deposer(acteur(req), b));
});

/** Téléchargement : contrôle d'accès puis envoi du fichier (aucun lien public). */
routesJustificatifs.get('/:id/contenu', async (req, res) => {
  const { contenu, j } = await svc.lireContenu(acteur(req), req.params.id);
  res.setHeader('Content-Type', j.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${j.nomFichier}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(contenu);
});

routesJustificatifs.post('/:id/decision', async (req, res) => {
  const b = z.object({ accepte: z.boolean(), motif: texte(1000).default('') }).parse(req.body);
  await svc.deciderJustificatif(acteur(req), req.params.id, b.accepte, b.motif);
  res.json({ ok: true });
});
