import { DocumentSnapshot } from 'firebase-admin/firestore';
import { COL, db } from '../infra/firebase';
import { Role, ROLES, Utilisateur } from '../domain/types';
import { rhCouvre } from '../domain/authz';

export function versUtilisateur(snap: DocumentSnapshot): Utilisateur | null {
  if (!snap.exists) return null;
  const d = snap.data() ?? {};
  return {
    uid: snap.id,
    email: d.email ?? '',
    nom: d.nom ?? '',
    prenom: d.prenom ?? '',
    roles: (Array.isArray(d.roles) ? d.roles : []).filter((r: string): r is Role =>
      (ROLES as readonly string[]).includes(r),
    ),
    campusId: d.campusId ?? '',
    serviceId: d.serviceId ?? '',
    fonction: d.fonction ?? '',
    managerId: d.managerId ?? null,
    actif: d.actif !== false,
    perimetreRh: {
      tous: d.perimetreRh?.tous === true,
      campusIds: Array.isArray(d.perimetreRh?.campusIds) ? d.perimetreRh.campusIds : [],
    },
    motDePasseProvisoire: d.motDePasseProvisoire === true,
    provisoireExpireLe: d.provisoireExpireLe?.toDate ? d.provisoireExpireLe.toDate().toISOString() : null,
  };
}

export async function lireUtilisateur(uid: string): Promise<Utilisateur | null> {
  if (!uid) return null;
  return versUtilisateur(await db().collection(COL.users).doc(uid).get());
}

export function nomComplet(u: Pick<Utilisateur, 'prenom' | 'nom' | 'email'>): string {
  const n = `${u.prenom} ${u.nom}`.trim();
  return n || u.email;
}

/** Gestionnaires RH actifs dont le périmètre couvre le campus indiqué. */
export async function rhDuCampus(campusId: string): Promise<Utilisateur[]> {
  const snap = await db().collection(COL.users).where('roles', 'array-contains', 'rh').get();
  return snap.docs
    .map(versUtilisateur)
    .filter((u): u is Utilisateur => !!u && u.actif && rhCouvre(u, { campusId }));
}

/** Vue publique d'un utilisateur (sans données sensibles). */
export function profilPublic(u: Utilisateur) {
  return {
    uid: u.uid,
    email: u.email,
    nom: u.nom,
    prenom: u.prenom,
    nomComplet: nomComplet(u),
    roles: u.roles,
    campusId: u.campusId,
    serviceId: u.serviceId,
    fonction: u.fonction,
    managerId: u.managerId,
    actif: u.actif,
    perimetreRh: u.perimetreRh,
    motDePasseProvisoire: u.motDePasseProvisoire === true,
    provisoireExpireLe: u.provisoireExpireLe ?? null,
    invitationExpiree: !!u.motDePasseProvisoire && !!u.provisoireExpireLe && Date.parse(u.provisoireExpireLe) < Date.now(),
  };
}

/** Utilisateurs actifs ayant un rôle donné (RH ou direction) dont le périmètre couvre le campus. */
export async function utilisateursDuRole(role: 'rh' | 'direction', campusId: string): Promise<Utilisateur[]> {
  const snap = await db().collection(COL.users).where('roles', 'array-contains', role).get();
  return snap.docs
    .map(versUtilisateur)
    .filter(
      (u): u is Utilisateur =>
        !!u && u.actif && u.roles.includes(role) && (u.perimetreRh.tous || u.perimetreRh.campusIds.includes(campusId)),
    );
}
