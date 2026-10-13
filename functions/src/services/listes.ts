/**
 * Listes paginées et filtrées selon la vue (mes dossiers, mon équipe, périmètre
 * RH). Le périmètre est TOUJOURS déduit de l'utilisateur authentifié, jamais
 * d'un paramètre client.
 */
import { Query } from 'firebase-admin/firestore';
import { db } from '../infra/firebase';
import { interdit } from '../infra/erreurs';
import { aLeRole } from '../domain/authz';
import { Utilisateur } from '../domain/types';

export type Vue = 'moi' | 'equipe' | 'rh' | 'direction';

export interface OptionsListe {
  vue: Vue;
  egalites?: Record<string, string | string[] | undefined>;
  du?: string;
  au?: string;
  limite?: number;
  curseur?: string;
  champDate?: string;
}

/** Applique le filtre de périmètre correspondant à la vue demandée. */
export function appliquerPerimetre(q: Query, acteur: Utilisateur, vue: Vue): Query | null {
  if (vue === 'moi') return q.where('userId', '==', acteur.uid);
  if (vue === 'equipe') {
    if (!aLeRole(acteur, 'responsable')) throw interdit('Vue réservée aux responsables hiérarchiques.');
    return q.where('managerId', '==', acteur.uid);
  }
  if (vue === 'direction') {
    if (!aLeRole(acteur, 'direction')) throw interdit('Vue réservée à la direction régionale.');
  } else if (!aLeRole(acteur, 'rh')) {
    throw interdit('Vue réservée aux gestionnaires RH.');
  }
  if (acteur.perimetreRh.tous) return q;
  const campus = acteur.perimetreRh.campusIds.slice(0, 30);
  if (!campus.length) return null; // périmètre vide : aucun dossier
  return q.where('campusId', 'in', campus);
}

export async function listerPagine<T>(
  collection: string,
  acteur: Utilisateur,
  o: OptionsListe,
  convertir: (snap: FirebaseFirestore.DocumentSnapshot) => T,
): Promise<{ elements: T[]; suivant: string | null }> {
  const champDate = o.champDate ?? 'dateDebut';
  const limite = Math.min(Math.max(o.limite ?? 20, 1), 100);
  let q = appliquerPerimetre(db().collection(collection), acteur, o.vue);
  if (!q) return { elements: [], suivant: null };

  for (const [champ, valeur] of Object.entries(o.egalites ?? {})) {
    if (valeur === undefined || valeur === '' || (Array.isArray(valeur) && !valeur.length)) continue;
    q = Array.isArray(valeur) ? (valeur.length === 1 ? q.where(champ, '==', valeur[0]) : q.where(champ, 'in', valeur)) : q.where(champ, '==', valeur);
  }
  if (o.du) q = q.where(champDate, '>=', o.du);
  if (o.au) q = q.where(champDate, '<=', o.au);
  q = q.orderBy(champDate, 'desc');

  if (o.curseur) {
    const curseur = await db().collection(collection).doc(o.curseur).get();
    if (curseur.exists) q = q.startAfter(curseur);
  }
  const snap = await q.limit(limite + 1).get();
  const docs = snap.docs.slice(0, limite);
  return {
    elements: docs.map(convertir),
    suivant: snap.docs.length > limite ? docs[docs.length - 1].id : null,
  };
}
