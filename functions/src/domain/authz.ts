/**
 * Règles d'autorisation (fonctions pures, testées unitairement).
 *
 * Principes :
 *  - un collaborateur ne voit que ses dossiers ;
 *  - un responsable voit les dossiers de son équipe (managerId = son uid) ;
 *  - un gestionnaire RH voit les dossiers des campus de son périmètre ;
 *  - l'administrateur gère les comptes mais n'a PAS accès aux dossiers ni aux
 *    justificatifs du seul fait de son rôle ;
 *  - la direction régionale signe l'accord des congés approuvés de son
 *    périmètre ; elle ne voit ni les signalements ni les justificatifs ;
 *  - personne ne valide sa propre demande, même en cumulant plusieurs rôles.
 */
import { Rattachement, Role, Utilisateur } from './types';

export function aLeRole(u: Pick<Utilisateur, 'roles'>, role: Role): boolean {
  return u.roles.includes(role);
}

export function estProprietaire(acteur: Utilisateur, dossier: Pick<Rattachement, 'userId'>): boolean {
  return acteur.uid === dossier.userId;
}

export function estResponsableDe(acteur: Utilisateur, dossier: Pick<Rattachement, 'managerId' | 'userId'>): boolean {
  return (
    aLeRole(acteur, 'responsable') &&
    dossier.managerId === acteur.uid &&
    dossier.userId !== acteur.uid
  );
}

function perimetreCouvre(acteur: Utilisateur, role: Role, cible: { campusId: string }): boolean {
  if (!aLeRole(acteur, role)) return false;
  const p = acteur.perimetreRh;
  return !!p && (p.tous || p.campusIds.includes(cible.campusId));
}

export function rhCouvre(acteur: Utilisateur, cible: { campusId: string }): boolean {
  return perimetreCouvre(acteur, 'rh', cible);
}

export function directionCouvre(acteur: Utilisateur, cible: { campusId: string }): boolean {
  return perimetreCouvre(acteur, 'direction', cible);
}

/**
 * Demandes de congé : mêmes accès que les autres dossiers, plus la direction
 * régionale du périmètre (qui doit pouvoir lire la demande qu'elle signe).
 */
export function peutVoirDemande(acteur: Utilisateur, dossier: Rattachement): boolean {
  return peutVoirDossier(acteur, dossier) || directionCouvre(acteur, dossier);
}

/** Signature « Accord de la direction » sur la fiche (jamais pour soi-même). */
export function peutSignerDirection(acteur: Utilisateur, dossier: Rattachement): boolean {
  return directionCouvre(acteur, dossier) && !estProprietaire(acteur, dossier);
}

export function peutVoirDossier(acteur: Utilisateur, dossier: Rattachement): boolean {
  return estProprietaire(acteur, dossier) || estResponsableDe(acteur, dossier) || rhCouvre(acteur, dossier);
}

/** Avis hiérarchique sur une demande de congé. */
export function peutDonnerAvis(acteur: Utilisateur, dossier: Rattachement): boolean {
  return estResponsableDe(acteur, dossier);
}

/** Décision finale RH (congés, signalements, justificatifs). */
export function peutDecider(acteur: Utilisateur, dossier: Rattachement): boolean {
  return rhCouvre(acteur, dossier) && !estProprietaire(acteur, dossier);
}

/**
 * Accès au contenu d'un justificatif : déposant ou RH habilité uniquement.
 * Ni le responsable, ni l'administrateur n'y ont accès.
 */
export function peutVoirJustificatif(acteur: Utilisateur, justificatif: Rattachement): boolean {
  return estProprietaire(acteur, justificatif) || rhCouvre(acteur, justificatif);
}

/** Le contenu médical (catégorie, commentaire) n'est visible que du déposant et des RH. */
export function peutVoirContenuMedical(acteur: Utilisateur, dossier: Rattachement): boolean {
  return estProprietaire(acteur, dossier) || rhCouvre(acteur, dossier);
}

/** Gestion des droits annuels d'un collaborateur (pas les siens). */
export function peutGererDotation(acteur: Utilisateur, cible: Utilisateur): boolean {
  return rhCouvre(acteur, cible) && acteur.uid !== cible.uid;
}

export function peutConsulterDotation(acteur: Utilisateur, cible: Utilisateur): boolean {
  return (
    acteur.uid === cible.uid ||
    estResponsableDe(acteur, { userId: cible.uid, managerId: cible.managerId }) ||
    rhCouvre(acteur, cible)
  );
}

export function peutGererComptes(acteur: Utilisateur): boolean {
  return aLeRole(acteur, 'admin');
}

export function peutExporter(acteur: Utilisateur): boolean {
  return aLeRole(acteur, 'rh');
}

export function peutModifierParametres(acteur: Utilisateur): boolean {
  return aLeRole(acteur, 'rh') && acteur.perimetreRh?.tous === true;
}
