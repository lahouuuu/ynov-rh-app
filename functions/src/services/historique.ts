import { Timestamp } from 'firebase-admin/firestore';
import { COL, db } from '../infra/firebase';
import { peutVoirContenuMedical } from '../domain/authz';
import { Rattachement, Utilisateur } from '../domain/types';
import { Entite } from './journal';

export function iso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  return null;
}

/**
 * Historique d'un dossier. L'appelant a déjà vérifié l'accès au dossier ; les
 * motifs et détails des dossiers médicaux sont masqués pour les profils non
 * habilités (responsable).
 */
export async function historiqueVisible(
  acteur: Utilisateur,
  entite: Entite,
  entiteId: string,
  dossier: Rattachement & { medical?: boolean },
) {
  const snap = await db()
    .collection(COL.historique)
    .where('entite', '==', entite)
    .where('entiteId', '==', entiteId)
    .orderBy('date', 'asc')
    .limit(200)
    .get();
  const masquer = !!dossier.medical && !peutVoirContenuMedical(acteur, dossier);
  return snap.docs.map((d) => {
    const h = d.data();
    return {
      id: d.id,
      action: h.action,
      resume: h.resume,
      motif: masquer ? null : h.motif,
      details: masquer ? {} : h.details,
      auteurNom: h.auteurNom,
      date: iso(h.date),
    };
  });
}
