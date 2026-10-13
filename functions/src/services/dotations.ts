/**
 * Droits annuels (dotations) et mouvements de solde.
 *
 * Un document `dotations/{uid}_{annee}` porte les compteurs agrégés ; chaque
 * modification ajoute un mouvement dans `mouvements` (jamais modifié ni
 * supprimé) avec auteur, date et motif. L'historique par année est conservé.
 */
import { DocumentReference, FieldValue, Transaction } from 'firebase-admin/firestore';
import { COL, db } from '../infra/firebase';
import { calculerSolde, CompteurDotation } from '../domain/solde';
import { enDemi, enJours } from '../domain/calendrier';
import { STATUTS_EN_ATTENTE, TypeMouvement, Utilisateur } from '../domain/types';
import { nomComplet } from './utilisateurs';

export const idDotation = (uid: string, annee: number) => `${uid}_${annee}`;
export const refDotation = (uid: string, annee: number) => db().collection(COL.dotations).doc(idDotation(uid, annee));

export interface EtatDotation extends CompteurDotation {
  existe: boolean;
  ref: DocumentReference;
  annee: number;
  userId: string;
}

/**
 * Lecture transactionnelle d'une dotation. Si elle n'existe pas encore, la
 * dotation par défaut est renvoyée et `creerDotationSiAbsente` devra être
 * appelée APRÈS toutes les lectures de la transaction.
 */
export async function lireDotationTx(
  tx: Transaction,
  uid: string,
  annee: number,
  dotationParDefaut: number,
): Promise<EtatDotation> {
  const ref = refDotation(uid, annee);
  const snap = await tx.get(ref);
  const d = snap.data();
  return {
    existe: snap.exists,
    ref,
    annee,
    userId: uid,
    joursAttribues: snap.exists ? Number(d?.joursAttribues ?? 0) : dotationParDefaut,
    ajustements: Number(d?.ajustements ?? 0),
    joursDebites: Number(d?.joursDebites ?? 0),
  };
}

export async function lireDotation(uid: string, annee: number, dotationParDefaut: number) {
  const snap = await refDotation(uid, annee).get();
  const d = snap.data();
  return {
    existe: snap.exists,
    annee,
    userId: uid,
    joursAttribues: snap.exists ? Number(d?.joursAttribues ?? 0) : dotationParDefaut,
    ajustements: Number(d?.ajustements ?? 0),
    joursDebites: Number(d?.joursDebites ?? 0),
  };
}

/** Écrit la dotation initiale et son mouvement si elle n'existait pas. */
export function creerDotationSiAbsente(tx: Transaction, etat: EtatDotation, cible: Utilisateur): void {
  if (etat.existe) return;
  tx.set(etat.ref, {
    userId: cible.uid,
    userNom: nomComplet(cible),
    campusId: cible.campusId,
    managerId: cible.managerId,
    annee: etat.annee,
    joursAttribues: etat.joursAttribues,
    ajustements: 0,
    joursDebites: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  ajouterMouvement(tx, {
    userId: cible.uid,
    annee: etat.annee,
    type: 'DOTATION_INITIALE',
    jours: etat.joursAttribues,
    motif: `Attribution annuelle ${etat.annee}`,
    auteur: 'systeme',
  });
  etat.existe = true;
}

export function ajouterMouvement(
  tx: Transaction,
  m: {
    userId: string;
    annee: number;
    type: TypeMouvement;
    jours: number;
    motif: string;
    auteur: Utilisateur | 'systeme';
    demandeId?: string;
    soldeApres?: number;
  },
): void {
  const ref = db().collection(COL.mouvements).doc();
  tx.set(ref, {
    userId: m.userId,
    annee: m.annee,
    type: m.type,
    jours: m.jours,
    motif: m.motif,
    demandeId: m.demandeId ?? null,
    soldeApres: m.soldeApres ?? null,
    auteurId: m.auteur === 'systeme' ? 'systeme' : m.auteur.uid,
    auteurNom: m.auteur === 'systeme' ? 'Système' : nomComplet(m.auteur),
    date: FieldValue.serverTimestamp(),
  });
}

/** Somme des jours payés des demandes en attente d'une année (hors demande exclue). */
export async function joursEnAttenteTx(
  tx: Transaction | null,
  uid: string,
  annee: number,
  exclureId?: string,
): Promise<number> {
  const q = db()
    .collection(COL.demandes)
    .where('userId', '==', uid)
    .where('annee', '==', annee)
    .where('statut', 'in', STATUTS_EN_ATTENTE);
  const snap = tx ? await tx.get(q) : await q.get();
  const demi = snap.docs
    .filter((d) => d.id !== exclureId)
    .reduce((acc, d) => acc + enDemi(Number(d.get('joursPayes') ?? 0)), 0);
  return enJours(demi);
}

export function resumeDotation(c: CompteurDotation & { annee: number }, enAttente: number) {
  const solde = calculerSolde(c);
  return {
    annee: c.annee,
    joursAttribues: c.joursAttribues,
    ajustements: c.ajustements,
    joursDebites: c.joursDebites,
    solde,
    enAttente,
    soldePrevisionnel: Math.max(0, enJours(enDemi(solde) - enDemi(enAttente))),
  };
}
