/**
 * Cycle de vie des identifiants :
 *  - création d'un compte par un administrateur → mot de passe PROVISOIRE
 *    aléatoire envoyé par e-mail à l'employé, avec le lien de première connexion ;
 *  - tant que le mot de passe est provisoire, l'API n'accepte que la consultation
 *    du profil et le changement de mot de passe (voir middleware/authentification) ;
 *  - le mot de passe provisoire expire (72 h par défaut) : l'administrateur
 *    renvoie alors une invitation.
 * Le mot de passe provisoire n'est jamais stocké par l'application (seul
 * Firebase Authentication en conserve l'empreinte).
 */
import { randomInt } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import { echapperHtml, envoyerCourriel } from './courriel';

export const DUREE_INVITATION_HEURES = Number(process.env.DUREE_INVITATION_HEURES ?? 72);

const MINUSCULES = 'abcdefghijkmnpqrstuvwxyz';
const MAJUSCULES = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHIFFRES = '23456789';
const SYMBOLES = '-_.!?@#%+';

/** Mot de passe provisoire de 16 caractères (générateur cryptographique, caractères non ambigus). */
export function genererMotDePasseProvisoire(longueur = 16): string {
  const tous = MINUSCULES + MAJUSCULES + CHIFFRES + SYMBOLES;
  const tirer = (jeu: string) => jeu[randomInt(jeu.length)];
  const car = [tirer(MINUSCULES), tirer(MAJUSCULES), tirer(CHIFFRES), tirer(SYMBOLES)];
  while (car.length < longueur) car.push(tirer(tous));
  // Mélange de Fisher-Yates
  for (let i = car.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [car[i], car[j]] = [car[j], car[i]];
  }
  return car.join('');
}

export function expirationInvitation(depuis = Date.now()): Timestamp {
  return Timestamp.fromMillis(depuis + DUREE_INVITATION_HEURES * 3_600_000);
}

/** URL publique de l'application (jamais déduite des en-têtes de la requête). */
export function urlApplication(): string {
  if (process.env.URL_APPLICATION) return process.env.URL_APPLICATION.replace(/\/+$/, '');
  const projet = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const local = process.env.FUNCTIONS_EMULATOR === 'true' || process.env.NODE_ENV === 'test' || !projet || projet.startsWith('demo-');
  return local ? 'http://localhost:3000' : `https://${projet}.web.app`;
}

export interface ResultatInvitation {
  envoyee: boolean;
  destinataire: string;
  expireLe: string;
  /** Renseigné UNIQUEMENT si l'e-mail n'a pas pu partir : à transmettre en main propre. */
  motDePasseProvisoire?: string;
}

/** Envoie l'e-mail d'invitation contenant le mot de passe provisoire et le lien de première connexion. */
export async function envoyerInvitation(
  cible: { email: string; prenom: string },
  motDePasse: string,
  expireLe: Timestamp,
  renvoi = false,
): Promise<ResultatInvitation> {
  const lien = `${urlApplication()}/mot-de-passe?email=${encodeURIComponent(cible.email)}`;
  const echeance = expireLe.toDate().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca', dateStyle: 'long', timeStyle: 'short' });
  const intro = renvoi
    ? 'De nouveaux identifiants provisoires ont été générés pour votre compte.'
    : 'Votre compte sur l’application de gestion des congés, absences et retards de Maroc Ynov Campus a été créé.';
  const texte = [
    `Bonjour ${cible.prenom},`,
    '',
    intro,
    '',
    `Identifiant : ${cible.email}`,
    `Mot de passe provisoire : ${motDePasse}`,
    '',
    `Avant le ${echeance}, ouvrez le lien ci-dessous pour choisir votre mot de passe personnel :`,
    lien,
    '',
    'Ce mot de passe provisoire ne permet rien d’autre que de définir votre mot de passe personnel.',
    'Si vous n’êtes pas à l’origine de cette demande, contactez le service RH.',
  ].join('\n');
  const html = `<p>Bonjour ${echapperHtml(cible.prenom)},</p>
<p>${echapperHtml(intro)}</p>
<p>Identifiant : <strong>${echapperHtml(cible.email)}</strong><br>
Mot de passe provisoire : <strong style="font-family:monospace;font-size:15px">${echapperHtml(motDePasse)}</strong></p>
<p>Avant le ${echapperHtml(echeance)}, choisissez votre mot de passe personnel :</p>
<p><a href="${echapperHtml(lien)}" style="display:inline-block;background:#23b2a4;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Choisir mon mot de passe</a></p>
<p style="color:#666;font-size:12px">Ce mot de passe provisoire ne permet rien d’autre que de définir votre mot de passe personnel. Si vous n’êtes pas à l’origine de cette demande, contactez le service RH.</p>`;

  const envoyee = await envoyerCourriel({ a: cible.email, sujet: 'Ynov RH — vos identifiants de connexion', texte, html });
  return {
    envoyee,
    destinataire: cible.email,
    expireLe: expireLe.toDate().toISOString(),
    ...(envoyee ? {} : { motDePasseProvisoire: motDePasse }),
  };
}
