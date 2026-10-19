/**
 * Outils des tests d'intégration : ils s'exécutent contre les émulateurs
 * Firebase (Auth, Firestore, Storage) lancés par `npm run test:integration`.
 */
import request from 'supertest';
// Doit rester le premier import local : fixe l'environnement avant l'API.
import { PROJET } from './environnement';
import { creerApp } from '../../src/app';
import * as fb from '../../src/infra/firebase';
import type { Role } from '../../src/domain/types';
export { PROJET };

const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';


export const app = creerApp();
export const db = fb.db;
export const auth = fb.auth;

export const ANNEE = new Date().getFullYear() + 1;
/** Date de l'année de test (toujours future). */
export const d = (mmjj: string) => `${ANNEE}-${mmjj}`;

export async function reinitialiser() {
  await fetch(`http://${FIRESTORE}/emulator/v1/projects/${PROJET}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${AUTH}/emulator/v1/projects/${PROJET}/accounts`, { method: 'DELETE' });
}

const MDP = 'MotDePasse!2026';

export interface Compte {
  uid: string;
  email: string;
  jeton: string;
}

export async function creerCompte(
  uid: string,
  roles: Role[],
  extra: { campusId?: string; managerId?: string | null; perimetreRh?: { tous: boolean; campusIds: string[] } } = {},
): Promise<Compte> {
  const email = `${uid}@demo.ynov.ma`;
  await auth().createUser({ uid, email, password: MDP });
  await db()
    .collection('users')
    .doc(uid)
    .set({
      email,
      nom: uid.toUpperCase(),
      prenom: uid,
      roles: ['collaborateur', ...roles.filter((r) => r !== 'collaborateur')],
      campusId: extra.campusId ?? 'casablanca',
      serviceId: 'pedagogie',
      managerId: extra.managerId ?? null,
      actif: true,
      perimetreRh: extra.perimetreRh ?? { tous: false, campusIds: [] },
    });
  return { uid, email, jeton: await connecter(email) };
}

export async function connecter(email: string): Promise<string> {
  return connecterAvec(email, MDP);
}

/** Connexion à l'émulateur d'authentification avec un mot de passe donné. */
export async function connecterAvec(email: string, password: string): Promise<string> {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=cle-factice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = (await r.json()) as { idToken?: string; error?: unknown };
  if (!j.idToken) throw new Error(`Connexion impossible : ${JSON.stringify(j.error)}`);
  return j.idToken;
}

export async function referentiels() {
  await db().collection('campus').doc('casablanca').set({ nom: 'Casablanca' });
  await db().collection('campus').doc('rabat').set({ nom: 'Rabat' });
  await db().collection('services').doc('pedagogie').set({ nom: 'Pédagogie' });
}

/** Client HTTP authentifié. */
export const api = (c: Compte) => ({
  get: (url: string) => request(app).get(`/api${url}`).set('Authorization', `Bearer ${c.jeton}`),
  post: (url: string, corps: object = {}) => request(app).post(`/api${url}`).set('Authorization', `Bearer ${c.jeton}`).send(corps),
  put: (url: string, corps: object = {}) => request(app).put(`/api${url}`).set('Authorization', `Bearer ${c.jeton}`).send(corps),
  patch: (url: string, corps: object = {}) => request(app).patch(`/api${url}`).set('Authorization', `Bearer ${c.jeton}`).send(corps),
});

let compteur = 0;
export const cle = () => `test-${Date.now()}-${compteur++}`;

export async function solde(c: Compte, annee = ANNEE): Promise<number> {
  const r = await api(c).get(`/dotations/moi?annee=${annee}`);
  return r.body.solde;
}

/** Premier jour ouvré (lundi) d'une semaine donnée de l'année de test. */
export function lundi(semaine: number): string {
  const jan1 = new Date(Date.UTC(ANNEE, 0, 1));
  const decalage = (8 - jan1.getUTCDay()) % 7; // jours jusqu'au premier lundi
  const date = new Date(Date.UTC(ANNEE, 0, 1 + decalage + 7 * semaine));
  return date.toISOString().slice(0, 10);
}

export function plusJours(s: string, n: number): string {
  const x = new Date(`${s}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
