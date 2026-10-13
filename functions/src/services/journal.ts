/**
 * Historique horodaté (append-only) et notifications dans l'application.
 * Ces écritures se font dans la même transaction que l'action métier lorsque
 * c'est possible, pour qu'une décision ne puisse exister sans sa trace.
 */
import { DocumentReference, FieldValue } from 'firebase-admin/firestore';
import { COL, db } from '../infra/firebase';
import { Utilisateur } from '../domain/types';
import { nomComplet } from './utilisateurs';

export type Entite = 'demande' | 'signalement' | 'dotation' | 'utilisateur' | 'justificatif' | 'parametres';

export interface EntreeHistorique {
  entite: Entite;
  entiteId: string;
  action: string;
  /** Message lisible, sans contenu médical. */
  resume: string;
  motif?: string | null;
  details?: Record<string, unknown>;
  /** Propriétaire du dossier concerné (pour filtrer l'accès). */
  userId?: string | null;
}

/** Transaction ou lot d'écritures : seule la méthode set est utilisée. */
export interface Ecrivain {
  set(ref: DocumentReference, data: Record<string, unknown>): unknown;
}

export function journaliser(ecr: Ecrivain, auteur: Utilisateur | 'systeme', e: EntreeHistorique): void {
  const ref = db().collection(COL.historique).doc();
  ecr.set(ref, {
    ...e,
    motif: e.motif ?? null,
    details: e.details ?? {},
    userId: e.userId ?? null,
    auteurId: auteur === 'systeme' ? 'systeme' : auteur.uid,
    auteurNom: auteur === 'systeme' ? 'Système' : nomComplet(auteur),
    date: FieldValue.serverTimestamp(),
  });
}

export interface Notification {
  titre: string;
  message: string;
  /** Lien interne vers le dossier, ex. /conges/detail?id=xxx */
  lien: string;
}

export function notifier(ecr: Ecrivain, destinataires: Array<string | null | undefined>, n: Notification): void {
  const uniques = [...new Set(destinataires.filter((d): d is string => !!d))];
  for (const userId of uniques) {
    const ref = db().collection(COL.notifications).doc();
    ecr.set(ref, { ...n, userId, lu: false, createdAt: FieldValue.serverTimestamp() });
  }
}
