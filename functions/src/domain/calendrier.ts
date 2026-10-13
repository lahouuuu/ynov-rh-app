/**
 * Calendrier de travail : calcul des jours ouvrés et des demi-journées.
 *
 * Toutes les dates sont des chaînes « AAAA-MM-JJ ». Les calculs se font en UTC
 * pour éviter tout décalage lié aux changements d'heure : seul le jour compte.
 * Les quantités sont manipulées en demi-journées entières pour éviter les
 * erreurs d'arrondi des nombres flottants (0.5 + 0.5 …).
 */
import { JourOuvre } from './types';

export const FUSEAU = 'Africa/Casablanca';
const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface Calendrier {
  joursOuvres: number[];
  joursFeries: string[];
}

export interface OptionsPeriode {
  /** La période commence l'après-midi du premier jour. */
  demiJourneeDebut?: boolean;
  /** La période se termine à midi le dernier jour. */
  demiJourneeFin?: boolean;
}

export class ErreurCalendrier extends Error {}

export function estDateValide(s: unknown): s is string {
  if (typeof s !== 'string' || !REGEX_DATE.test(s)) return false;
  const d = versDate(s);
  return !Number.isNaN(d.getTime()) && versChaine(d) === s;
}

export function versDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function versChaine(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ajouterJours(s: string, n: number): string {
  const d = versDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return versChaine(d);
}

export function anneeDe(s: string): number {
  return Number(s.slice(0, 4));
}

/** Date du jour dans le fuseau Africa/Casablanca. */
export function aujourdhui(maintenant: Date = new Date()): string {
  // en-CA produit le format AAAA-MM-JJ
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant);
}

/** Vrai si les intervalles [a1, a2] et [b1, b2] (inclus) se chevauchent. */
export function chevauche(a1: string, a2: string, b1: string, b2: string): boolean {
  return a1 <= b2 && b1 <= a2;
}

/**
 * Liste les jours ouvrés d'une période avec leur valeur (1 ou 0,5).
 * Les week-ends et jours fériés ne sont pas décomptés.
 */
export function joursOuvresDeLaPeriode(
  debut: string,
  fin: string,
  calendrier: Calendrier,
  options: OptionsPeriode = {},
): JourOuvre[] {
  if (!estDateValide(debut) || !estDateValide(fin)) {
    throw new ErreurCalendrier('Les dates doivent être au format AAAA-MM-JJ.');
  }
  if (fin < debut) {
    throw new ErreurCalendrier('La date de fin doit être postérieure ou égale à la date de début.');
  }
  if (debut === fin && options.demiJourneeDebut && options.demiJourneeFin) {
    throw new ErreurCalendrier(
      "Une période d'un seul jour ne peut pas commencer l'après-midi et finir le matin.",
    );
  }
  const feries = new Set(calendrier.joursFeries);
  const ouvres = new Set(calendrier.joursOuvres);
  const resultat: JourOuvre[] = [];

  for (let jour = debut; jour <= fin; jour = ajouterJours(jour, 1)) {
    const jourSemaine = versDate(jour).getUTCDay();
    if (!ouvres.has(jourSemaine) || feries.has(jour)) continue;
    let demi = 2; // en demi-journées
    if (jour === debut && options.demiJourneeDebut) demi -= 1;
    if (jour === fin && options.demiJourneeFin) demi -= 1;
    resultat.push({ date: jour, valeur: demi / 2 });
  }
  return resultat;
}

export function sommeJours(jours: JourOuvre[]): number {
  return enJours(jours.reduce((acc, j) => acc + enDemi(j.valeur), 0));
}

/** Convertit un nombre de jours en demi-journées entières. */
export function enDemi(jours: number): number {
  return Math.round(jours * 2);
}

export function enJours(demi: number): number {
  return demi / 2;
}

/**
 * Découpe une période qui traverse plusieurs années civiles.
 * Exemple : 2026-12-28 → 2027-01-05 donne deux périodes.
 */
export function scinderParAnnee(
  debut: string,
  fin: string,
  options: OptionsPeriode = {},
): Array<{ annee: number; debut: string; fin: string; options: OptionsPeriode }> {
  const periodes = [];
  let courant = debut;
  while (courant <= fin) {
    const annee = anneeDe(courant);
    const finAnnee = `${annee}-12-31`;
    const finPeriode = fin < finAnnee ? fin : finAnnee;
    periodes.push({
      annee,
      debut: courant,
      fin: finPeriode,
      options: {
        demiJourneeDebut: courant === debut ? options.demiJourneeDebut : false,
        demiJourneeFin: finPeriode === fin ? options.demiJourneeFin : false,
      },
    });
    courant = ajouterJours(finPeriode, 1);
  }
  return periodes;
}

/** Durée en minutes entre deux heures « HH:MM » (0 si l'arrivée précède l'heure prévue). */
export function minutesDeRetard(heurePrevue: string, heureArrivee: string): number {
  const m = (h: string) => {
    const [hh, mm] = h.split(':').map(Number);
    return hh * 60 + mm;
  };
  return Math.max(0, m(heureArrivee) - m(heurePrevue));
}
