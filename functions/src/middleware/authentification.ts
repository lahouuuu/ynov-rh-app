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
    /** Date de la dernière saisie du mot de passe (secondes, claim auth_time du jeton). */
    authTime?: number;
  }
}

/** Seules routes accessibles avec un mot de passe provisoire. */
const ROUTES_MOT_DE_PASSE_PROVISOIRE = new Set(['GET /moi', 'POST /moi/mot-de-passe']);

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
      req.authTime = typeof decode.auth_time === 'number' ? decode.auth_time : undefined;
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
    if (utilisateur.motDePasseProvisoire) {
      if (utilisateur.provisoireExpireLe && Date.parse(utilisateur.provisoireExpireLe) < Date.now()) {
        throw new ErreurHttp(
          403,
          'MOT_DE_PASSE_PROVISOIRE_EXPIRE',
          "Votre mot de passe provisoire a expiré. Demandez à l'administrateur de vous renvoyer une invitation.",
        );
      }
      const route = `${req.method} ${req.path.replace(/\/+$/, '')}`;
      if (!ROUTES_MOT_DE_PASSE_PROVISOIRE.has(route)) {
        throw new ErreurHttp(403, 'MOT_DE_PASSE_A_CHANGER', 'Vous devez d’abord choisir votre mot de passe personnel.');
      }
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
