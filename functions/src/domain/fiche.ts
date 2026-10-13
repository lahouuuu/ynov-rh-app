/**
 * Contenu de la fiche papier « Demande de congé » (formulaire F031/DI).
 * Fonctions pures : elles transforment une demande approuvée en libellés prêts
 * à imprimer (période, date de reprise, solde restant…). Le rendu PDF est fait
 * dans services/fiche.ts.
 */
import { createHash } from 'node:crypto';
import { ajouterJours, Calendrier, versDate } from './calendrier';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

const morceaux = (s: string) => {
  const d = versDate(s);
  return { jour: d.getUTCDate(), mois: MOIS[d.getUTCMonth()], annee: d.getUTCFullYear(), semaine: JOURS[d.getUTCDay()] };
};

/** « 3,5 jours », « 1 jour », « 0,5 jour ». */
export function nombreDeJours(n: number): string {
  const v = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${v} jour${n > 1 ? 's' : ''}`;
}

/** « Mercredi 22 juillet 2026 ». */
export function dateLongue(s: string): string {
  const m = morceaux(s);
  return `${m.semaine} ${m.jour === 1 ? '1er' : m.jour} ${m.mois} ${m.annee}`;
}

/** « 17/07/2026 ». */
export function dateCourte(s: string): string {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

/**
 * Période choisie : « Du 17 juillet au 21 juillet 2026 inclus », avec mention
 * des demi-journées et de l'année de début si elle diffère de l'année de fin.
 */
export function periodeChoisie(debut: string, fin: string, demiDebut = false, demiFin = false): string {
  const a = morceaux(debut);
  const b = morceaux(fin);
  const jourA = `${a.jour === 1 ? '1er' : a.jour} ${a.mois}${a.annee !== b.annee ? ` ${a.annee}` : ''}`;
  const jourB = `${b.jour === 1 ? '1er' : b.jour} ${b.mois} ${b.annee}`;
  const apresMidi = demiDebut ? ' (après-midi)' : '';
  const matin = demiFin ? ' (matin)' : '';
  if (debut === fin) return `Le ${jourB}${apresMidi}${matin}`;
  return `Du ${jourA}${apresMidi} au ${jourB}${matin} inclus`;
}

/**
 * Date de reprise du travail : le jour ouvré suivant la fin du congé, ou le
 * dernier jour à 14 h si le congé se termine à midi.
 */
export function dateDeReprise(fin: string, demiFin: boolean, cal: Calendrier): { date: string; libelle: string } {
  if (demiFin) return { date: fin, libelle: `${dateLongue(fin)} (après-midi)` };
  const feries = new Set(cal.joursFeries);
  const ouvres = new Set(cal.joursOuvres);
  let jour = ajouterJours(fin, 1);
  for (let i = 0; i < 60 && (!ouvres.has(versDate(jour).getUTCDay()) || feries.has(jour)); i++) {
    jour = ajouterJours(jour, 1);
  }
  return { date: jour, libelle: dateLongue(jour) };
}

export interface ContenuFiche {
  numero: string;
  nom: string;
  prenom: string;
  fonction: string;
  annee: string;
  nombreJours: string;
  periode: string;
  reprise: string;
  resteAcquis: string;
  interim: string;
  signataireEmploye: string;
  dateEmploye: string;
}

export function contenuFiche(e: {
  numero: string;
  nom: string;
  prenom: string;
  fonction: string;
  annee: number;
  dateDebut: string;
  dateFin: string;
  demiJourneeDebut: boolean;
  demiJourneeFin: boolean;
  dureeTotale: number;
  joursNonPayes: number;
  solde: number;
  dateSolde: string;
  interim: string;
  dateDemande: string | null;
  calendrier: Calendrier;
}): ContenuFiche {
  const nonPayes = e.joursNonPayes > 0 ? ` (dont ${nombreDeJours(e.joursNonPayes)} non payé${e.joursNonPayes > 1 ? 's' : ''})` : '';
  return {
    numero: e.numero,
    nom: e.nom.toUpperCase(),
    prenom: e.prenom,
    fonction: e.fonction,
    annee: String(e.annee),
    nombreJours: `${nombreDeJours(e.dureeTotale)}${nonPayes}`,
    periode: periodeChoisie(e.dateDebut, e.dateFin, e.demiJourneeDebut, e.demiJourneeFin),
    reprise: dateDeReprise(e.dateFin, e.demiJourneeFin, e.calendrier).libelle,
    resteAcquis: `${nombreDeJours(Math.max(0, e.solde))} au ${dateCourte(e.dateSolde)}`,
    interim: e.interim,
    signataireEmploye: `${e.prenom} ${e.nom}`.trim(),
    dateEmploye: e.dateDemande ? dateCourte(e.dateDemande) : '',
  };
}

// ---------------------------------------------------------------------------
// Code de vérification (anti-falsification)
// ---------------------------------------------------------------------------


export interface EmpreinteFiche {
  numero: string;
  userId: string;
  dateDebut: string;
  dateFin: string;
  dureeTotale: number;
  joursPayes: number;
  joursNonPayes: number;
  statut: string;
  ficheStatut: string | null;
  /** uid + date ISO de chaque visa apposé (ou null). */
  visas: Array<{ role: string; uid: string; date: string } | null>;
}

/**
 * Code imprimé sur la fiche : empreinte SHA-256 du contenu et des visas,
 * salée par un secret aléatoire propre à la demande (jamais transmis au
 * client). Toute modification d'une fiche imprimée (dates, durée, signataire)
 * rend le code invalide lors de la vérification dans l'application.
 */
export function codeVerification(sel: string, e: EmpreinteFiche): string {
  const h = createHash('sha256').update(sel).update(JSON.stringify(e)).digest('hex').toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}`;
}
