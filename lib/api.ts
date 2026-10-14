/**
 * Client HTTP de l'API. Chaque requête porte le jeton d'identité Firebase de
 * l'utilisateur connecté ; l'API le vérifie et applique rôles et périmètres.
 */
import { getToken } from 'firebase/app-check';
import { appCheck, auth, EMULATEUR_FONCTIONS, PROJET_DEMO, utiliseEmulateurs } from './firebase';

/**
 * URL de l'API : celle fournie, sinon /api en production (Firebase Hosting),
 * sinon l'émulateur de fonctions en développement local.
 */
const BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (utiliseEmulateurs && process.env.NODE_ENV === 'development'
    ? `${EMULATEUR_FONCTIONS}/${PROJET_DEMO}/europe-west1/api`
    : '/api');

export class ErreurApi extends Error {
  constructor(
    public statut: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function entetes(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) throw new ErreurApi(401, 'NON_AUTHENTIFIE', 'Veuillez vous connecter.');
  const entetes: Record<string, string> = { Authorization: `Bearer ${await u.getIdToken()}` };
  if (appCheck) {
    try {
      entetes['X-Firebase-AppCheck'] = (await getToken(appCheck, false)).token;
    } catch {
      /* l'API refusera la requête si App Check est obligatoire */
    }
  }
  return entetes;
}

async function requete(methode: string, chemin: string, corps?: unknown): Promise<Response> {
  let rep: Response;
  try {
    rep = await fetch(`${BASE}${chemin}`, {
      method: methode,
      headers: { ...(await entetes()), ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: corps !== undefined ? JSON.stringify(corps) : undefined,
    });
  } catch (e) {
    if (e instanceof ErreurApi) throw e;
    throw new ErreurApi(0, 'RESEAU', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
  }
  if (!rep.ok) {
    let erreur = { code: 'ERREUR', message: `Erreur ${rep.status}`, details: undefined as unknown };
    try {
      erreur = (await rep.json()).erreur ?? erreur;
    } catch {
      /* corps non JSON */
    }
    throw new ErreurApi(rep.status, erreur.code, erreur.message, erreur.details);
  }
  return rep;
}

export const api = {
  get: async <T>(chemin: string) => (await (await requete('GET', chemin)).json()) as T,
  post: async <T = { ok: true }>(chemin: string, corps: unknown = {}) => (await (await requete('POST', chemin, corps)).json()) as T,
  put: async <T = { ok: true }>(chemin: string, corps: unknown) => (await (await requete('PUT', chemin, corps)).json()) as T,
  patch: async <T = { ok: true }>(chemin: string, corps: unknown) => (await (await requete('PATCH', chemin, corps)).json()) as T,
  /** Télécharge un fichier protégé et déclenche son enregistrement (aucun lien public). */
  telecharger: async (chemin: string, nomParDefaut: string) => {
    const rep = await requete('GET', chemin);
    const blob = await rep.blob();
    const dispo = rep.headers.get('Content-Disposition') ?? '';
    const nom = /filename="([^"]+)"/.exec(dispo)?.[1] ?? nomParDefaut;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

export function messageErreur(e: unknown): string {
  if (e instanceof ErreurApi) return e.message;
  if (e instanceof Error) return e.message;
  return 'Une erreur est survenue.';
}

/** Identifiant aléatoire pour éviter les doubles soumissions. */
export function nouvelleCle(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '')
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
}
