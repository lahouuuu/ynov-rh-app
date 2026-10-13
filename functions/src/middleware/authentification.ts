/**
 * Vérifie pour CHAQUE requête : jeton Firebase valide et non révoqué, compte
 * existant et actif. Le profil (rôles, rattachements) est relu en base à chaque
 * appel : une désactivation ou un changement de rôle prend effet immédiatement.
 */
import type { NextFunction, Request, Response } from 'express';
import { auth } from '../infra/firebase';
import { ErreurHttp } from '../infra/erreurs';
import { lireUtilisateur } from '../services/utilisateurs';
import { Role, Utilisateur } from '../domain/types';
import { aLeRole } from '../domain/authz';

declare module 'express-serve-static-core' {
  interface Request {
    utilisateur?: Utilisateur;
  }
}

export async function authentifier(req: Request, _res: Response, next: NextFunction) {
  try {
    const entete = req.headers.authorization || '';
    const [schema, jeton] = entete.split(' ');
    if (schema !== 'Bearer' || !jeton) {
      throw new ErreurHttp(401, 'NON_AUTHENTIFIE', 'Authentification requise.');
    }
    let uid: string;
    try {
      const decode = await auth().verifyIdToken(jeton, true);
      uid = decode.uid;
    } catch {
      throw new ErreurHttp(401, 'SESSION_INVALIDE', 'Votre session a expiré. Veuillez vous reconnecter.');
    }
    const utilisateur = await lireUtilisateur(uid);
    if (!utilisateur) {
      throw new ErreurHttp(403, 'COMPTE_INCONNU', "Ce compte n'est pas configuré dans l'application. Contactez l'administrateur.");
    }
    if (!utilisateur.actif) {
      throw new ErreurHttp(403, 'COMPTE_DESACTIVE', 'Ce compte est désactivé.');
    }
    req.utilisateur = utilisateur;
    next();
  } catch (e) {
    next(e);
  }
}

/** Exige au moins un des rôles indiqués. */
export function exigerRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.utilisateur;
    if (!u || !roles.some((r) => aLeRole(u, r))) {
      next(new ErreurHttp(403, 'ACCES_REFUSE', "Votre rôle ne permet pas d'effectuer cette action."));
      return;
    }
    next();
  };
}

export function acteur(req: Request): Utilisateur {
  if (!req.utilisateur) throw new ErreurHttp(401, 'NON_AUTHENTIFIE', 'Authentification requise.');
  return req.utilisateur;
}
