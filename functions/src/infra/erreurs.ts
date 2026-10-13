import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import * as logger from 'firebase-functions/logger';
import { ErreurCalendrier } from '../domain/calendrier';
import { ErreurSolde } from '../domain/solde';

/** Erreur métier renvoyée au client avec un message clair en français. */
export class ErreurHttp extends Error {
  constructor(
    public statut: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const interdit = (message = "Vous n'avez pas accès à cette ressource.") =>
  new ErreurHttp(403, 'ACCES_REFUSE', message);
export const introuvable = (message = 'Ressource introuvable.') => new ErreurHttp(404, 'INTROUVABLE', message);
export const conflit = (code: string, message: string, details?: unknown) =>
  new ErreurHttp(409, code, message, details);
export const invalide = (message: string, details?: unknown) =>
  new ErreurHttp(400, 'REQUETE_INVALIDE', message, details);

export const gestionnaireErreurs: ErrorRequestHandler = (err, _req, res, _next) => {
  void _next;
  if (err instanceof ErreurHttp) {
    if (err.statut === 401 || err.statut === 403) {
      // Trace des refus d'accès (détection de tentatives hors périmètre)
      logger.warn('Accès refusé', { code: err.code, statut: err.statut, uid: _req.utilisateur?.uid ?? null, methode: _req.method, chemin: _req.path });
    }
    res.status(err.statut).json({ erreur: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    const premiers = err.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'requête'} : ${i.message}`);
    res.status(400).json({
      erreur: { code: 'REQUETE_INVALIDE', message: `Données invalides — ${premiers.join(' ; ')}`, details: err.issues },
    });
    return;
  }
  if (err instanceof ErreurCalendrier || err instanceof ErreurSolde) {
    res.status(400).json({ erreur: { code: 'REGLE_METIER', message: err.message } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ erreur: { code: 'TROP_VOLUMINEUX', message: 'Le fichier envoyé est trop volumineux.' } });
    return;
  }
  logger.error('Erreur inattendue', err);
  res.status(500).json({ erreur: { code: 'ERREUR_INTERNE', message: 'Une erreur inattendue est survenue. Réessayez plus tard.' } });
};
