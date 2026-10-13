/**
 * Règles de solde et de répartition payée / non payée.
 *
 * Solde disponible = droits attribués ± ajustements − jours payés des demandes
 * approuvées non annulées. Les demandes en attente ne modifient pas le solde
 * mais sont affichées séparément et prises en compte pour proposer une
 * répartition réaliste (« solde prévisionnel »).
 */
import { enDemi, enJours } from './calendrier';
import { JourOuvre, Plage, Repartition, TypeConge } from './types';

export interface CompteurDotation {
  joursAttribues: number;
  ajustements: number;
  joursDebites: number;
}

export function calculerSolde(c: CompteurDotation): number {
  return enJours(enDemi(c.joursAttribues) + enDemi(c.ajustements) - enDemi(c.joursDebites));
}

/**
 * Vérifie qu'une modification de dotation ou un ajustement ne rend pas le solde
 * négatif. Renvoie le nouveau solde.
 */
export function verifierSoldeNonNegatif(c: CompteurDotation): number {
  const solde = calculerSolde(c);
  if (solde < 0) {
    throw new ErreurSolde(
      `Opération bloquée : le solde deviendrait négatif (${formaterJours(solde)}). ` +
        'Une régularisation RH est nécessaire.',
    );
  }
  return solde;
}

export class ErreurSolde extends Error {}

/**
 * Répartit les jours ouvrés d'une demande entre jours payés (imputés sur le
 * solde) et jours non payés. Les premiers jours de la période sont payés tant
 * que le solde le permet, une demi-journée pouvant être scindée.
 */
export function repartir(jours: JourOuvre[], soldeDisponible: number, type: TypeConge): Repartition {
  let reste = type === 'conge_paye' ? Math.max(0, enDemi(soldeDisponible)) : 0;
  const payes: JourOuvre[] = [];
  const nonPayes: JourOuvre[] = [];

  for (const jour of jours) {
    const demi = enDemi(jour.valeur);
    const partPayee = Math.min(reste, demi);
    reste -= partPayee;
    if (partPayee > 0) payes.push({ date: jour.date, valeur: enJours(partPayee) });
    if (demi - partPayee > 0) nonPayes.push({ date: jour.date, valeur: enJours(demi - partPayee) });
  }

  const total = jours.reduce((a, j) => a + enDemi(j.valeur), 0);
  const totalPaye = payes.reduce((a, j) => a + enDemi(j.valeur), 0);
  return {
    dureeTotale: enJours(total),
    joursPayes: enJours(totalPaye),
    joursNonPayes: enJours(total - totalPaye),
    plagesPayees: regrouperEnPlages(payes),
    plagesNonPayees: regrouperEnPlages(nonPayes),
  };
}

/**
 * Regroupe des jours ouvrés consécutifs (dans l'ordre fourni) en plages
 * lisibles pour le récapitulatif : week-ends et fériés n'interrompent pas une
 * plage puisque seuls les jours ouvrés sont listés.
 */
export function regrouperEnPlages(jours: JourOuvre[]): Plage[] {
  const plages: Plage[] = [];
  for (const j of jours) {
    const derniere = plages[plages.length - 1];
    if (derniere) {
      derniere.fin = j.date;
      derniere.jours = enJours(enDemi(derniere.jours) + enDemi(j.valeur));
    } else {
      plages.push({ debut: j.date, fin: j.date, jours: j.valeur });
    }
  }
  return plages;
}

/**
 * La répartition acceptée par le collaborateur est-elle toujours couverte par
 * le solde actuel ? Utilisé au moment de la décision RH.
 */
export function repartitionCouverte(joursPayes: number, soldeActuel: number): boolean {
  return enDemi(joursPayes) <= enDemi(soldeActuel);
}

export function formaterJours(n: number): string {
  const v = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return `${v} jour${Math.abs(n) > 1 ? 's' : ''}`;
}
