/**
 * Protections transverses de l'API :
 *  - en-têtes HTTP de sécurité sur toutes les réponses ;
 *  - limitation de débit par utilisateur (anti-abus, anti-scraping) ;
 *  - vérification facultative de Firebase App Check (requêtes provenant
 *    uniquement de l'application officielle), activée par APPCHECK_OBLIGATOIRE.
 */
import type { NextFunction, Request, Response } from 'express';
import { getAppCheck } from 'firebase-admin/app-check';
import * as logger from 'firebase-functions/logger';
import { ErreurHttp } from '../infra/erreurs';

export function enTetesSecurite(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cache-Control', 'private, no-store');
  next();
}

interface Fenetre {
  debut: number;
  nombre: number;
}

/**
 * Limiteur à fenêtre fixe, en mémoire de l'instance. Chaque instance Cloud
 * Functions compte séparément : c'est une protection contre les abus d'un
 * compte (boucles, aspiration de données), pas un pare-feu global.
 */
export function limiteur(nom: string, max: number, fenetreMs: number) {
  const compteurs = new Map<string, Fenetre>();
  return (req: Request, res: Response, next: NextFunction) => {
    const cle = req.utilisateur?.uid ?? req.ip ?? 'anonyme';
    const maintenant = Date.now();
    const f = compteurs.get(cle);
    if (!f || maintenant - f.debut > fenetreMs) {
      compteurs.set(cle, { debut: maintenant, nombre: 1 });
      if (compteurs.size > 10_000) compteurs.clear(); // borne mémoire
      next();
      return;
    }
    f.nombre += 1;
    if (f.nombre > max) {
      const attente = Math.ceil((fenetreMs - (maintenant - f.debut)) / 1000);
      res.setHeader('Retry-After', String(attente));
      logger.warn('Limite de débit atteinte', { limiteur: nom, uid: req.utilisateur?.uid, chemin: req.path });
      next(new ErreurHttp(429, 'TROP_DE_REQUETES', `Trop de requêtes. Réessayez dans ${attente} s.`));
      return;
    }
    next();
  };
}

/** App Check : rejette les appels qui ne proviennent pas de l'application enregistrée. */
export async function verifierAppCheck(req: Request, _res: Response, next: NextFunction) {
  if (process.env.APPCHECK_OBLIGATOIRE !== 'true') {
    next();
    return;
  }
  const jeton = req.header('X-Firebase-AppCheck');
  if (!jeton) {
    next(new ErreurHttp(401, 'APPCHECK_ABSENT', 'Requête refusée : application non reconnue.'));
    return;
  }
  try {
    await getAppCheck().verifyToken(jeton);
    next();
  } catch {
    next(new ErreurHttp(401, 'APPCHECK_INVALIDE', 'Requête refusée : application non reconnue.'));
  }
}
