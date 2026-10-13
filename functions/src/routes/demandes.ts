import { Router } from 'express';
import { z } from 'zod';
import { acteur } from '../middleware/authentification';
import { COL } from '../infra/firebase';
import { STATUTS_DEMANDE, TYPES_CONGE } from '../domain/types';
import * as svc from '../services/demandes';
import { listerPagine } from '../services/listes';
import { listerPourDossier } from '../services/justificatifs';
import { historiqueVisible } from '../services/historique';
import { construireFiche, genererFiche, verifierFiche } from '../services/fiche';
import { cle, date, liste, pagination, texte } from './schemas';

export const routesDemandes = Router();

const saisie = z.object({
  type: z.enum(TYPES_CONGE),
  dateDebut: date,
  dateFin: date,
  demiJourneeDebut: z.boolean().optional(),
  demiJourneeFin: z.boolean().optional(),
  commentaire: texte(1000).optional(),
  interim: texte(150).optional(),
});

routesDemandes.post('/simulation', async (req, res) => {
  const s = saisie.parse(req.body);
  res.json(await svc.simuler(acteur(req), s));
});

routesDemandes.post('/', async (req, res) => {
  const s = saisie
    .extend({ accordNonPaye: z.boolean().optional(), soumettre: z.boolean().optional(), attestation: z.boolean().optional(), cleIdempotence: cle })
    .parse(req.body);
  const r = await svc.creer(acteur(req), s);
  res.status(r.doublon ? 200 : 201).json(r);
});

routesDemandes.get('/', async (req, res) => {
  const q = pagination
    .extend({
      vue: z.enum(['moi', 'equipe', 'rh', 'direction']).default('moi'),
      ficheStatut: z.enum(['attente_direction', 'signee', 'refusee_direction', 'annulee']).optional(),
      statut: liste(STATUTS_DEMANDE as unknown as [string, ...string[]]),
      type: z.enum(TYPES_CONGE).optional(),
    })
    .parse(req.query);
  const r = await listerPagine(COL.demandes, acteur(req), { ...q, egalites: { statut: q.statut, type: q.type, ficheStatut: q.ficheStatut } }, svc.versDemande);
  res.json(r);
});

/** Vérification d'une fiche imprimée (numéro + code). Déclarée avant /:id. */
routesDemandes.get('/fiches/verifier', async (req, res) => {
  const q = z.object({ numero: z.string().regex(/^\d{4}-\d{4}$/, 'numéro attendu : AAAA-NNNN'), code: z.string().min(4).max(30) }).parse(req.query);
  res.json(await verifierFiche(acteur(req), q.numero, q.code));
});

routesDemandes.get('/:id', async (req, res) => {
  const u = acteur(req);
  const d = await svc.chargerDemande(u, req.params.id);
  const [justificatifs, historique] = await Promise.all([
    listerPourDossier(u, d.id),
    historiqueVisible(u, 'demande', d.id, d),
  ]);
  res.json({ demande: d, actions: svc.actionsPossibles(u, d), justificatifs, historique });
});

/** Fiche F031 en ligne (contenu, visas électroniques, code de vérification). */
routesDemandes.get('/:id/fiche/donnees', async (req, res) => {
  res.json(await construireFiche(acteur(req), req.params.id));
});

/** Accord (ou refus motivé) de la direction régionale. */
routesDemandes.post('/:id/direction', async (req, res) => {
  const b = z.object({ accord: z.boolean(), motif: texte(1000).default('') }).parse(req.body);
  await svc.signerDirection(acteur(req), req.params.id, b.accord, b.motif);
  res.json({ ok: true });
});

/** Modification d'un brouillon par son auteur. */
routesDemandes.put('/:id', async (req, res) => {
  await svc.modifierBrouillon(acteur(req), req.params.id, saisie.parse(req.body));
  res.json({ ok: true });
});

/** Fiche « Demande de congé » (F031/DI) en PDF, avec visas électroniques. */
routesDemandes.get('/:id/fiche', async (req, res) => {
  const { pdf, nomFichier } = await genererFiche(acteur(req), req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(pdf);
});

routesDemandes.post('/:id/soumettre', async (req, res) => {
  const b = z.object({ accordNonPaye: z.boolean().optional(), attestation: z.boolean().optional() }).parse(req.body ?? {});
  await svc.soumettre(acteur(req), req.params.id, b.accordNonPaye, b.attestation);
  res.json({ ok: true });
});

routesDemandes.post('/:id/avis', async (req, res) => {
  const b = z.object({ favorable: z.boolean(), commentaire: texte(1000).default('') }).parse(req.body);
  await svc.donnerAvis(acteur(req), req.params.id, b.favorable, b.commentaire);
  res.json({ ok: true });
});

routesDemandes.post('/:id/decision', async (req, res) => {
  const b = z.object({ decision: z.enum(['approuver', 'refuser']), motif: texte(1000).default('') }).parse(req.body);
  await svc.decider(acteur(req), req.params.id, b.decision, b.motif);
  res.json({ ok: true });
});

routesDemandes.post('/:id/reconfirmer', async (req, res) => {
  const b = z.object({ accordNonPaye: z.boolean().optional() }).parse(req.body ?? {});
  await svc.reconfirmer(acteur(req), req.params.id, b.accordNonPaye);
  res.json({ ok: true });
});

routesDemandes.post('/:id/annuler', async (req, res) => {
  const b = z.object({ motif: texte(1000).default('') }).parse(req.body ?? {});
  await svc.annulerParCollaborateur(acteur(req), req.params.id, b.motif);
  res.json({ ok: true });
});

routesDemandes.post('/:id/annulation/decision', async (req, res) => {
  const b = z.object({ accepter: z.boolean(), motif: texte(1000) }).parse(req.body);
  await svc.deciderAnnulation(acteur(req), req.params.id, b.accepter, b.motif);
  res.json({ ok: true });
});
