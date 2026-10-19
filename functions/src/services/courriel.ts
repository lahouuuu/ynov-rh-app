/**
 * Envoi des e-mails transactionnels (invitations, renvoi d'identifiants).
 *
 * Le serveur d'envoi (SMTP) est configuré par variables d'environnement de la
 * fonction ; le mot de passe SMTP est un secret (Secret Manager) :
 *   SMTP_HOTE, SMTP_PORT (465 par défaut), SMTP_UTILISATEUR, SMTP_MOT_DE_PASSE,
 *   SMTP_EXPEDITEUR (ex. « Ynov RH <rh@ynov.ma> »).
 *
 * Sans configuration (développement local, démonstration), aucun e-mail ne part :
 * le message est écrit dans le journal de la fonction et l'appelant en est
 * informé pour transmettre les identifiants autrement (en main propre).
 */
import { createTransport } from 'nodemailer';
import * as logger from 'firebase-functions/logger';

export interface Courriel {
  a: string;
  sujet: string;
  texte: string;
  html: string;
}

export function smtpConfigure(): boolean {
  return !!(process.env.SMTP_HOTE && process.env.SMTP_UTILISATEUR && process.env.SMTP_MOT_DE_PASSE);
}

/** Envoie l'e-mail ; renvoie false (sans lever d'erreur) si l'envoi est impossible. */
export async function envoyerCourriel(c: Courriel): Promise<boolean> {
  if (!smtpConfigure()) {
    logger.info('E-mail non envoyé (SMTP non configuré)', { a: c.a, sujet: c.sujet });
    return false;
  }
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = createTransport({
    host: process.env.SMTP_HOTE,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_UTILISATEUR, pass: process.env.SMTP_MOT_DE_PASSE },
    // Aucune lecture de fichier ni d'URL depuis le contenu du message
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_EXPEDITEUR ?? process.env.SMTP_UTILISATEUR,
      to: c.a,
      subject: c.sujet,
      text: c.texte,
      html: c.html,
    });
    return true;
  } catch (e) {
    logger.error("Échec de l'envoi de l'e-mail", { a: c.a, sujet: c.sujet, erreur: (e as Error).message });
    return false;
  }
}

/** Échappe le texte inséré dans le HTML d'un e-mail. */
export function echapperHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] as string);
}
